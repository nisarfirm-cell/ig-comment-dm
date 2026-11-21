import { describe, expect, it } from "vitest";
import { handleApi, type ApiContext } from "../src/api";
import { createSession, verifySession } from "../src/auth";
import { detectApiMode, InstagramClient } from "../src/instagram";
import { currentToken, maybeRefreshToken } from "../src/token";
import { fakeApi, makeRule, makeStore } from "./helpers";

const PW = "correct horse battery staple";
const env = { ADMIN_PASSWORD: PW, IG_ACCESS_TOKEN: "secret-token", META_APP_SECRET: "s", WEBHOOK_VERIFY_TOKEN: "vt" };

async function ctx(over: Partial<ApiContext["env"]> = {}): Promise<ApiContext> {
  const ig = fakeApi();
  return { env: { ...env, ...over }, store: await makeStore(), makeClient: () => ig.client };
}

function req(path: string, init: { method?: string; body?: unknown; cookie?: string; contentType?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = init.contentType ?? "application/json";
  if (init.cookie) headers.Cookie = init.cookie;
  return new Request(`https://autodm.test${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}

async function login(c: ApiContext): Promise<string> {
  const res = await handleApi(req("/api/login", { method: "POST", body: { password: PW } }), c);
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("Set-Cookie")!;
  expect(setCookie).toMatch(/HttpOnly/);
  expect(setCookie).toMatch(/SameSite=Strict/);
  expect(setCookie).toMatch(/Secure/);
  return setCookie.split(";")[0];
}

describe("sessions", () => {
  it("accepts its own cookie and rejects tampered, expired or other-password cookies", async () => {
    const now = 1_700_000_000_000;
    const { value } = await createSession(PW, now);
    expect(await verifySession(value, PW, now)).toBe(true);
    expect(await verifySession(value.replace(/.$/, (c) => (c === "0" ? "1" : "0")), PW, now)).toBe(false);
    expect(await verifySession(value, PW, now + 15 * 86_400_000)).toBe(false);
    expect(await verifySession(value, "other password", now)).toBe(false);
    const [, sig] = value.split(".");
    expect(await verifySession(`${now + 999 * 86_400_000}.${sig}`, PW, now)).toBe(false); // can't extend expiry
    expect(await verifySession("", PW, now)).toBe(false);
  });
});

describe("dashboard API", () => {
  it("refuses everything until ADMIN_PASSWORD is set", async () => {
    const res = await handleApi(req("/api/rules"), await ctx({ ADMIN_PASSWORD: "" }));
    expect(res.status).toBe(503);
  });

  it("requires a session", async () => {
    const c = await ctx();
    expect((await handleApi(req("/api/rules"), c)).status).toBe(401);
    expect((await handleApi(req("/api/rules", { cookie: "igdm_session=123.abc" }), c)).status).toBe(401);
  });

  it("rejects a wrong password and rate-limits guessing", async () => {
    const c = await ctx();
    for (let i = 0; i < 10; i++) {
      expect((await handleApi(req("/api/login", { method: "POST", body: { password: "nope" } }), c)).status).toBe(401);
    }
    expect((await handleApi(req("/api/login", { method: "POST", body: { password: PW } }), c)).status).toBe(429);
  });

  it("rejects non-JSON writes (CSRF guard)", async () => {
    const c = await ctx();
    const cookie = await login(c);
    const res = await handleApi(req("/api/rules", { method: "POST", body: "name=x", contentType: "application/x-www-form-urlencoded", cookie }), c);
    expect(res.status).toBe(415);
  });

  it("creates, lists, edits, toggles and deletes automations", async () => {
    const c = await ctx();
    const cookie = await login(c);
    const input = { ...makeRule(), id: undefined };

    const bad = await handleApi(req("/api/rules", { method: "POST", body: { ...input, keywords: [] }, cookie }), c);
    expect(bad.status).toBe(422);
    expect((await bad.json<any>()).errors.keywords).toBeDefined();

    const created = await handleApi(req("/api/rules", { method: "POST", body: input, cookie }), c);
    expect(created.status).toBe(201);
    const { rule } = await created.json<any>();

    const list = await (await handleApi(req("/api/rules", { cookie }), c)).json<any>();
    expect(list.rules).toHaveLength(1);
    expect(list.rules[0].stats).toEqual({ matched: 0, dms: 0, taps: 0, links: 0 });

    const edited = await handleApi(req(`/api/rules/${rule.id}`, { method: "PUT", body: { ...input, name: "Renamed" }, cookie }), c);
    expect((await edited.json<any>()).rule.name).toBe("Renamed");

    await handleApi(req(`/api/rules/${rule.id}/enabled`, { method: "POST", body: { enabled: false }, cookie }), c);
    expect((await c.store.getRule(rule.id))!.enabled).toBe(false);

    expect((await handleApi(req(`/api/rules/${rule.id}`, { method: "DELETE", cookie }), c)).status).toBe(200);
    expect((await handleApi(req(`/api/rules/${rule.id}`, { cookie }), c)).status).toBe(404);
  });

  it("returns overview, media and settings", async () => {
    const c = await ctx();
    const cookie = await login(c);
    const ov = await (await handleApi(req("/api/overview?tz=-330", { cookie }), c)).json<any>();
    expect(ov.account.username).toBe("creator");
    expect(ov.setup).toMatchObject({ tokenWorks: true, webhookUrl: "https://autodm.test/webhook", rules: 0 });
    expect(ov.series).toHaveLength(14);

    const media = await (await handleApi(req("/api/media", { cookie }), c)).json<any>();
    expect(media.media[0]).toMatchObject({ id: "111", productType: "REELS", thumb: "https://cdn.test/t.jpg" });

    const put = await handleApi(req("/api/settings", { method: "PUT", body: { cooldownDays: 2, onFollowCheckError: "send_link" }, cookie }), c);
    expect(put.status).toBe(200);
    expect((await c.store.getSettings()).cooldownDays).toBe(2);
  });
});

describe("access token refresh", () => {
  it("stores the refreshed token, keeps it fresh, and lets a new secret win", async () => {
    const store = await makeStore();
    const ig = fakeApi();
    expect((await currentToken(store, "IGsecret-1")).source).toBe("secret");

    const r = await maybeRefreshToken(store, "IGsecret-1", { fetchImpl: ig.fetchImpl, now: 1000 });
    expect(r.refreshed).toBe(true);
    expect(ig.calls[0].path).toContain("grant_type=ig_refresh_token");
    expect(await currentToken(store, "IGsecret-1")).toMatchObject({ token: "IGrefreshed-token", source: "refreshed", refreshedAt: 1000 });

    expect(await maybeRefreshToken(store, "IGsecret-1", { fetchImpl: ig.fetchImpl, now: 2000 })).toEqual({ refreshed: false, reason: "token is still fresh" });

    // The owner pasted a brand new token into the secret: use it, not the old refreshed copy.
    expect(await currentToken(store, "IGsecret-2")).toMatchObject({ token: "IGsecret-2", source: "secret" });
  });

  it("never tries to refresh a Unified login token", async () => {
    const store = await makeStore();
    const ig = fakeApi();
    const r = await maybeRefreshToken(store, "EAAunified-token", { fetchImpl: ig.fetchImpl, force: true });
    expect(r.refreshed).toBe(false);
    expect(ig.calls).toHaveLength(0);
  });
});

describe("Unified login vs Instagram login", () => {
  it("detects the setup from the token, with an override", () => {
    expect(detectApiMode("IGAAabc")).toBe("instagram");
    expect(detectApiMode("EAAabc")).toBe("unified");
    expect(detectApiMode("EAAabc", "instagram")).toBe("instagram");
    expect(detectApiMode("IGAAabc", "nonsense")).toBe("instagram");
  });

  it("uses graph.facebook.com and the Instagram account ID in Unified mode", async () => {
    const ig = fakeApi();
    const client = new InstagramClient("EAAtoken", "v27.0", ig.fetchImpl, "unified");
    const account = await client.getAccount();
    expect(account).toMatchObject({ userId: "17841400000000000", username: "creator", followers: 1200 });
    await client.listMedia(5);
    await client.subscribeApp("comments,messages,messaging_postbacks");
    await client.privateReply("17841400000000000", "c1", { text: "hi" });
    expect(ig.calls.every((c) => c.host === "graph.facebook.com")).toBe(true);
    expect(ig.calls.map((c) => `${c.method} ${c.path.split("?")[0]}`)).toEqual([
      "GET /me/assigned_instagram_accounts",
      "GET /17841400000000000",
      "GET /17841400000000000/media", // account ID looked up once and reused
      "POST /17841400000000000/subscribed_apps",
      "POST /17841400000000000/messages",
    ]);
  });

  it("keeps graph.instagram.com and /me paths in Instagram login mode", async () => {
    const ig = fakeApi();
    const client = new InstagramClient("IGtoken", "v27.0", ig.fetchImpl, "instagram");
    await client.getAccount();
    await client.listMedia(5);
    await client.subscribeApp("comments");
    expect(ig.calls.every((c) => c.host === "graph.instagram.com")).toBe(true);
    expect(ig.calls.map((c) => c.path.split("?")[0])).toEqual(["/me", "/me/media", "/me/subscribed_apps"]);
  });
});

describe("retry failed DMs endpoint", () => {
  it("needs a session, reports the count and retries", async () => {
    const c = await ctx();
    c.retryPauseMs = 0;
    expect((await handleApi(req("/api/failed/retry", { method: "POST", body: {} }), c)).status).toBe(401);
    const cookie = await login(c);
    await c.store.saveRule(makeRule());
    await c.store.saveFailed({ commentId: "c1", igId: "17841400000000000", ruleId: "repo", userId: "9990001", username: "tester", text: "repo", error: "limit" });
    const count = await (await handleApi(req("/api/failed", { cookie }), c)).json();
    expect(count.count).toBe(1);
    const res = await handleApi(req("/api/failed/retry", { method: "POST", body: {}, cookie }), c);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 1, failed: 0, remaining: 0 });
  });
});
