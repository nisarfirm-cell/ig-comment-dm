import { describe, expect, it } from "vitest";
import { verificationResponse } from "../src/index";
import { hmacSha256Hex, verifySignature } from "../src/signature";

const secret = "test-app-secret";
const body = JSON.stringify({ object: "instagram", entry: [{ id: "1", text: "வணக்கம் repo" }] });
const sign = async (b: string, s = secret) => "sha256=" + (await hmacSha256Hex(s, b));

describe("signature validation", () => {
  it("produces the well-known HMAC-SHA256 test vector", async () => {
    expect(await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog")).toBe(
      "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    );
  });

  it("accepts a correctly signed body", async () => {
    expect(await verifySignature(body, (await sign(body)), secret)).toBe(true);
  });

  it("accepts an upper-case hex signature", async () => {
    expect(await verifySignature(body, "sha256=" + (await sign(body)).slice(7).toUpperCase(), secret)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    expect(await verifySignature(body + " ", (await sign(body)), secret)).toBe(false);
  });

  it("rejects a signature made with another secret", async () => {
    expect(await verifySignature(body, await sign(body, "other"), secret)).toBe(false);
  });

  it("rejects missing, malformed or sha1 headers", async () => {
    expect(await verifySignature(body, null, secret)).toBe(false);
    expect(await verifySignature(body, "", secret)).toBe(false);
    expect(await verifySignature(body, "sha256=", secret)).toBe(false);
    expect(await verifySignature(body, (await sign(body)).replace("sha256", "sha1"), secret)).toBe(false);
    expect(await verifySignature(body, (await sign(body)).slice(0, -2), secret)).toBe(false);
  });

  it("rejects everything when the app secret is not configured", async () => {
    expect(await verifySignature(body, await sign(body), "")).toBe(false);
  });
});

describe("verification handshake", () => {
  const url = (q: string) => new URL("https://example.test/webhook?" + q);

  it("echoes hub.challenge when the verify token matches", async () => {
    const res = verificationResponse(url("hub.mode=subscribe&hub.challenge=1158201444&hub.verify_token=tok"), "tok");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("1158201444");
  });

  it("refuses a wrong token, wrong mode or unset token", () => {
    expect(verificationResponse(url("hub.mode=subscribe&hub.challenge=1&hub.verify_token=bad"), "tok").status).toBe(403);
    expect(verificationResponse(url("hub.mode=other&hub.challenge=1&hub.verify_token=tok"), "tok").status).toBe(403);
    expect(verificationResponse(url("hub.mode=subscribe&hub.challenge=1&hub.verify_token="), undefined).status).toBe(403);
  });
});

describe("webhook endpoint", () => {
  it("rejects a badly signed POST and explains it once in Activity", async () => {
    const { default: worker } = await import("../src/index");
    const { fakeD1 } = await import("./fakeD1");
    const { Store } = await import("../src/store");
    const db = fakeD1();
    const env: any = { DB: db, META_APP_SECRET: "right-secret", IG_ACCESS_TOKEN: "EAAx", WEBHOOK_VERIFY_TOKEN: "vt", GRAPH_API_VERSION: "v27.0" };
    const pending: Promise<unknown>[] = [];
    const ctx: any = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} };
    const post = async () => {
      const b = JSON.stringify({ object: "instagram", entry: [] });
      const res = await worker.fetch(
        new Request("https://autodm.test/webhook", { method: "POST", body: b, headers: { "X-Hub-Signature-256": await sign(b, "wrong-secret") } }) as any,
        env,
        ctx,
      );
      await Promise.all(pending);
      return res;
    };
    expect((await post()).status).toBe(401);
    expect((await post()).status).toBe(401);
    const store = new Store(db);
    const events = await store.listEvents(10);
    expect(events).toHaveLength(1); // throttled
    expect(events[0].detail).toContain("META_APP_SECRET");
    expect(await store.getValue("last_webhook_attempt_at")).not.toBeNull();
    expect(await store.getValue("last_webhook_at")).toBeNull();
  });
});
