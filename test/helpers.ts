import { InstagramClient } from "../src/instagram";
import type { Rule } from "../src/rules";
import { Store } from "../src/store";
import { fakeD1 } from "./fakeD1";

export const IG_ID = "17841400000000000";
export const USER = "9990001";

export function makeRule(over: Partial<Rule> = {}): Rule {
  return {
    id: "repo",
    name: "Repo",
    enabled: true,
    mediaId: "any",
    mediaCaption: "",
    mediaThumb: "",
    keywords: ["REPO"],
    match: "word",
    publicReplies: ["Check your DM"],
    dmText: "Tap below",
    dmButton: "Send me the link",
    requireFollow: true,
    followText: "Please follow first",
    followButton: "I followed",
    linkText: "Here you go",
    linkUrl: "https://example.test/repo",
    linkButton: "",
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

export async function makeStore(now?: () => number) {
  const store = new Store(fakeD1(), now);
  await store.init();
  return store;
}

export interface Call {
  host: string;
  method: string;
  path: string;
  body: any;
}

/** Fake graph.instagram.com. `state` steers its answers during a test. */
export function fakeApi(opts: { follows?: boolean | "error"; rejectTemplatePrivateReply?: boolean; failPrivateReply?: boolean } = {}) {
  const calls: Call[] = [];
  const state = { follows: opts.follows ?? true, failPrivateReply: opts.failPrivateReply ?? false, rateLimitPrivateReply: false };
  const fetchImpl = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const raw = typeof init.body === "string" ? init.body : "";
    const body = raw.startsWith("{") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    calls.push({ host: url.host, method, path: url.pathname.replace(/^\/v[\d.]+/, "") + url.search, body });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

    if (url.pathname.endsWith("/refresh_access_token")) return json({ access_token: "IGrefreshed-token", token_type: "bearer", expires_in: 5183944 });
    // Unified login: /me is the system user; the Instagram account comes from assigned_instagram_accounts.
    if (method === "GET" && url.pathname.endsWith("/me/assigned_instagram_accounts")) return json({ data: [{ id: IG_ID, username: "creator" }] });
    if (method === "GET" && url.pathname.endsWith(`/${IG_ID}`)) return json({ id: IG_ID, username: "creator", followers_count: 1200 });
    if (method === "GET" && url.pathname.endsWith(`/${IG_ID}/media`)) return json({ data: [{ id: "111", caption: "My reel", media_type: "VIDEO", media_product_type: "REELS", thumbnail_url: "https://cdn.test/t.jpg", permalink: "https://instagram.test/p/1", timestamp: "2026-11-01T00:00:00+0000" }] });
    if (method === "GET" && url.pathname.endsWith("/me")) return json({ user_id: IG_ID, username: "creator", followers_count: 1200 });
    if (method === "GET" && url.pathname.endsWith("/me/media")) return json({ data: [{ id: "111", caption: "My reel", media_type: "VIDEO", media_product_type: "REELS", thumbnail_url: "https://cdn.test/t.jpg", permalink: "https://instagram.test/p/1", timestamp: "2026-11-01T00:00:00+0000" }] });
    if (url.pathname.endsWith("/subscribed_apps")) return json({ success: true });
    if (method === "GET") {
      if (state.follows === "error") return json({ error: { message: "User consent is required to access user profile" } }, 400);
      return json({ is_user_follow_business: state.follows });
    }
    if (url.pathname.endsWith("/replies")) return json({ id: "reply1" });
    if (body?.recipient?.comment_id) {
      if (state.rateLimitPrivateReply) return json({ error: { message: "Application request limit reached", code: 4 } }, 400);
      if (state.failPrivateReply) return json({ error: { message: "outside allowed window", code: 10 } }, 400);
      if (body.message.attachment && opts.rejectTemplatePrivateReply) return json({ error: { message: "templates not allowed here" } }, 400);
    }
    return json({ recipient_id: USER, message_id: "m_out" });
  };
  const client = new InstagramClient("token", "v27.0", fetchImpl);
  return { calls, state, fetchImpl, client };
}
