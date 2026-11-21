import { describe, expect, it } from "vitest";
import { handleApi } from "../src/api";
import { privacyPage } from "../src/index";
import { privacyHtml } from "../src/privacy";
import { fakeApi, makeStore } from "./helpers";

describe("privacy page", () => {
  it("uses the owner's details and escapes them", () => {
    const html = privacyHtml({ ownerName: 'Tech <b>"Guru"</b>', contactEmail: "me@example.com", username: "creator" });
    expect(html).toContain("Tech &lt;b&gt;&quot;Guru&quot;&lt;/b&gt;");
    expect(html).not.toContain("<b>\"Guru\"");
    expect(html).toContain('href="mailto:me@example.com"');
    expect(html).toContain('id="delete"');
  });

  it("falls back to an Instagram DM when no email is set", () => {
    const html = privacyHtml({ ownerName: "", contactEmail: "", username: "creator" });
    expect(html).toContain("instagram.com/creator/");
    expect(html).not.toContain("mailto:");
  });

  it("is served publicly with a strict CSP, using the cached username", async () => {
    const store = await makeStore();
    await store.setValue("account_username", "creator");
    await store.saveSettings({ ...(await store.getSettings()), ownerName: "Creator Name" });
    const res = await privacyPage(store);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    const body = await res.text();
    expect(body).toContain("Creator Name");
    expect(body).toContain("@creator");
  });
});

describe("settings + approval progress API", () => {
  const PW = "pw-for-tests-123";
  async function setup() {
    const ig = fakeApi();
    const c = { env: { ADMIN_PASSWORD: PW, IG_ACCESS_TOKEN: "t" }, store: await makeStore(), makeClient: () => ig.client };
    const login = await handleApi(
      new Request("https://x.test/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: PW }) }),
      c,
    );
    const cookie = login.headers.get("Set-Cookie")!.split(";")[0];
    const call = (path: string, method = "GET", body?: unknown) =>
      handleApi(
        new Request(`https://x.test${path}`, {
          method,
          headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        }),
        c,
      );
    return { c, call };
  }

  it("saves a partial settings update without wiping other fields", async () => {
    const { c, call } = await setup();
    await call("/api/settings", "PUT", { cooldownDays: 3 });
    const res = await call("/api/settings", "PUT", { contactEmail: "me@example.com" });
    expect(res.status).toBe(200);
    expect(await c.store.getSettings()).toMatchObject({ cooldownDays: 3, contactEmail: "me@example.com" });
    expect((await call("/api/settings", "PUT", { contactEmail: "nope" })).status).toBe(422);
  });

  it("stores approval progress and ignores junk keys", async () => {
    const { call } = await setup();
    const res = await call("/api/review-progress", "PUT", { progress: { calls: true, settings: 1, "bad key!": true } });
    expect((await res.json<any>()).progress).toEqual({ calls: true, settings: true });
    expect((await (await call("/api/review-progress")).json<any>()).progress).toEqual({ calls: true, settings: true });
  });

  it("caches the account username for the privacy page when the overview loads", async () => {
    const { c, call } = await setup();
    await call("/api/overview");
    expect(await c.store.getValue("account_username")).toBe("creator");
  });
});
