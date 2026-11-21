import { beforeEach, describe, expect, it } from "vitest";
import { handleWebhook, retryFailed, type Deps } from "../src/flow";
import type { Store } from "../src/store";
import { fakeApi, IG_ID, makeRule, makeStore, USER } from "./helpers";

const commentEvent = (commentId: string, text: string, fromId = USER) => ({
  object: "instagram",
  entry: [
    {
      id: IG_ID,
      time: 1,
      changes: [{ field: "comments", value: { id: commentId, text, from: { id: fromId, username: "tester" }, media: { id: "111", media_product_type: "REELS" } } }],
    },
  ],
});

const postbackEvent = (mid: string, payload: string) => ({
  object: "instagram",
  entry: [{ id: IG_ID, time: 1, messaging: [{ sender: { id: USER }, recipient: { id: IG_ID }, timestamp: 1, postback: { mid, title: "x", payload } }] }],
});

const textEvent = (mid: string, text: string, extra: object = {}) => ({
  object: "instagram",
  entry: [{ id: IG_ID, time: 1, messaging: [{ sender: { id: USER }, recipient: { id: IG_ID }, timestamp: 1, message: { mid, text, ...extra } }] }],
});

let api: ReturnType<typeof fakeApi>;
let store: Store;
let deps: Deps;

async function setup(opts?: Parameters<typeof fakeApi>[0], rule = makeRule()) {
  api = fakeApi(opts);
  store = await makeStore();
  await store.saveRule(rule);
  deps = { ig: api.client, store };
}

const privateReplies = () => api.calls.filter((c) => c.body?.recipient?.comment_id);
const publicReplies = () => api.calls.filter((c) => c.path.endsWith("/replies"));
const directMessages = () => api.calls.filter((c) => c.body?.recipient?.id);
const eventTypes = async () => (await store.listEvents(100)).map((e) => e.type).reverse();

describe("de-duplication store", () => {
  it("claims a key only once, and again after it expires", async () => {
    let now = 1_000_000;
    const s = await makeStore(() => now);
    expect(await s.claim("c1", 60)).toBe(true);
    expect(await s.claim("c1", 60)).toBe(false);
    expect(await s.claim("c2", 60)).toBe(true);
    now += 61_000;
    expect(await s.claim("c1", 60)).toBe(true);
  });

  it("release lets a key be claimed again", async () => {
    const s = await makeStore();
    await s.claim("k", 60);
    await s.release("k");
    expect(await s.claim("k", 60)).toBe(true);
  });
});

describe("comment -> private reply", () => {
  beforeEach(() => setup());

  it("sends one private reply with a button, then the public reply", async () => {
    await handleWebhook(commentEvent("c1", "REPO please"), deps);
    expect(privateReplies()).toHaveLength(1);
    const dm = privateReplies()[0];
    expect(dm.method).toBe("POST");
    expect(dm.path).toBe(`/${IG_ID}/messages`);
    expect(dm.body.recipient).toEqual({ comment_id: "c1" });
    expect(dm.body.message.attachment.payload).toMatchObject({
      template_type: "button",
      text: "Tap below",
      buttons: [{ type: "postback", title: "Send me the link", payload: "LINK:repo" }],
    });
    expect(publicReplies()).toHaveLength(1);
    expect(publicReplies()[0].path).toBe("/c1/replies");
    expect(publicReplies()[0].body.message).toBe("Check your DM");
    expect(await eventTypes()).toEqual(["comment_matched", "dm_sent", "public_reply_sent"]);
  });

  it("does nothing when Meta re-delivers the same comment", async () => {
    await handleWebhook(commentEvent("c1", "repo"), deps);
    await handleWebhook(commentEvent("c1", "repo"), deps);
    expect(privateReplies()).toHaveLength(1);
    expect(publicReplies()).toHaveLength(1);
  });

  it("does not message the same person twice within the cooldown", async () => {
    await handleWebhook(commentEvent("c1", "repo"), deps);
    await handleWebhook(commentEvent("c2", "repo again"), deps);
    expect(privateReplies()).toHaveLength(1);
    expect((await eventTypes()).at(-1)).toBe("skipped_cooldown");
  });

  it("messages the same person again when the cooldown is 0", async () => {
    await store.saveSettings({ ...(await store.getSettings()), cooldownDays: 0 });
    await handleWebhook(commentEvent("c1", "repo"), deps);
    await handleWebhook(commentEvent("c2", "repo"), deps);
    expect(privateReplies()).toHaveLength(2);
  });

  it("still messages a different person", async () => {
    await handleWebhook(commentEvent("c1", "repo"), deps);
    await handleWebhook(commentEvent("c2", "repo", "9990002"), deps);
    expect(privateReplies()).toHaveLength(2);
  });

  it("ignores comments without the keyword, our own comments and paused automations", async () => {
    await handleWebhook(commentEvent("c1", "super video"), deps);
    await handleWebhook(commentEvent("c2", "repo", IG_ID), deps);
    await store.saveRule(makeRule({ enabled: false }));
    await handleWebhook(commentEvent("c3", "repo"), deps);
    expect(api.calls).toHaveLength(0);
  });

  it("falls back to plain text when the button private reply is refused", async () => {
    await setup({ rejectTemplatePrivateReply: true });
    await handleWebhook(commentEvent("c1", "repo"), deps);
    expect(privateReplies()).toHaveLength(2); // refused template, then text
    expect(privateReplies()[1].body.message).toEqual({ text: "Tap below\n\nReply YES to get the link." });
    expect(publicReplies()).toHaveLength(1);
  });

  it("logs a failed DM, skips the public reply and lets the person try again", async () => {
    await setup({ failPrivateReply: true });
    await handleWebhook(commentEvent("c1", "repo"), deps);
    expect(publicReplies()).toHaveLength(0);
    const events = await store.listEvents(10);
    expect(events[0].type).toBe("dm_failed");
    expect(events[0].detail).toContain("outside allowed window");
    await handleWebhook(commentEvent("c2", "repo"), deps); // not blocked by cooldown
    expect((await eventTypes()).filter((t) => t === "dm_failed")).toHaveLength(2);
  });
});

describe("retry failed DMs", () => {
  const noPause = { pauseMs: 0 };

  it("re-sends the private reply for a failed comment, once", async () => {
    await setup({ failPrivateReply: true });
    await handleWebhook(commentEvent("c1", "repo"), deps);
    expect((await store.countFailed(3)).count).toBe(1);

    api.state.failPrivateReply = false;
    const r = await retryFailed(deps, noPause);
    expect(r).toMatchObject({ sent: 1, failed: 0, remaining: 0, stoppedForRateLimit: false });
    const last = privateReplies().at(-1)!;
    expect(last.body.recipient).toEqual({ comment_id: "c1" });
    expect(publicReplies()).toHaveLength(1);
    const dm = (await store.listEvents(5)).find((e) => e.type === "dm_sent");
    expect(dm?.detail).toContain("retry");

    const again = await retryFailed(deps, noPause); // nothing left
    expect(again.sent).toBe(0);
    expect(privateReplies().filter((c) => c.body.recipient.comment_id === "c1")).toHaveLength(3); // button + text failed, then the retried button DM
  });

  it("stops at the first rate-limit error", async () => {
    await setup({ failPrivateReply: true });
    await store.saveSettings({ ...(await store.getSettings()), cooldownDays: 0 });
    for (const [c, u] of [["c1", "u1"], ["c2", "u2"], ["c3", "u3"]]) await handleWebhook(commentEvent(c, "repo", u), deps);
    api.state.failPrivateReply = false;
    api.state.rateLimitPrivateReply = true;
    const before = privateReplies().length;
    const r = await retryFailed(deps, noPause);
    expect(r).toMatchObject({ sent: 0, failed: 1, stoppedForRateLimit: true, remaining: 3 });
    expect(privateReplies().length - before).toBe(1); // no text fallback, no further comments
  });

  it("gives up after 3 attempts and skips people already messaged", async () => {
    await setup({ failPrivateReply: true });
    await handleWebhook(commentEvent("c1", "repo"), deps);
    for (let i = 0; i < 3; i++) await retryFailed(deps, noPause);
    expect((await store.countFailed(3)).count).toBe(0);
    expect((await eventTypes()).filter((t) => t === "dm_retry_failed")).toHaveLength(3);

    api.state.failPrivateReply = false;
    await handleWebhook(commentEvent("c2", "repo"), deps); // new comment works
    await store.saveFailed({ commentId: "c9", igId: IG_ID, ruleId: "repo", userId: USER, username: "tester", text: "repo", error: "x" });
    const r = await retryFailed(deps, noPause);
    expect(r).toMatchObject({ sent: 0, skipped: 1 }); // cooldown: they already got the DM
  });

  it("drops comments older than Meta's 7-day window", async () => {
    let now = Date.now();
    api = fakeApi({ failPrivateReply: true });
    store = await makeStore(() => now);
    await store.saveRule(makeRule());
    deps = { ig: api.client, store };
    await handleWebhook(commentEvent("c1", "repo"), deps);
    now += 7 * 86_400_000;
    api.state.failPrivateReply = false;
    const r = await retryFailed(deps, noPause);
    expect(r.sent).toBe(0);
    expect(privateReplies().filter((c) => !c.body.message.attachment)).toHaveLength(1); // only the original text fallback
  });
});

describe("explains ignored comments in Activity", () => {
  it("says why the owner's own keyword comment did nothing", async () => {
    await setup();
    await handleWebhook(commentEvent("c1", "REPO test", IG_ID), deps);
    const [e] = await store.listEvents(1);
    expect(e.type).toBe("comment_ignored");
    expect(e.detail).toContain("second account");
    expect(api.calls).toHaveLength(0);
  });

  it("does not log our own non-keyword replies", async () => {
    await setup();
    await handleWebhook(commentEvent("c1", "Check your DM", IG_ID), deps);
    expect(await store.listEvents(5)).toHaveLength(0);
  });

  it("logs comments without a keyword and keyword comments on another post", async () => {
    await setup({}, makeRule({ mediaId: "999" }));
    await handleWebhook(commentEvent("c1", "nice video"), deps);
    await handleWebhook(commentEvent("c2", "REPO pls"), deps); // event media is 111, rule is for 999
    const events = await store.listEvents(5);
    expect(events.map((e) => e.type)).toEqual(["comment_ignored", "comment_ignored"]);
    expect(events[0].detail).toContain("different post");
    expect(events[1].detail).toContain("No automation keyword");
  });
});

describe("button tap -> follow check -> link", () => {
  it("sends the link to a follower", async () => {
    await setup({ follows: true });
    await handleWebhook(postbackEvent("m1", "LINK:repo"), deps);
    expect(api.calls[0]).toMatchObject({ method: "GET", path: `/${USER}?fields=is_user_follow_business` });
    expect(directMessages()).toHaveLength(1);
    expect(directMessages()[0].body).toEqual({ recipient: { id: USER }, message: { text: "Here you go\nhttps://example.test/repo" } });
  });

  it("sends the link as a web_url button when configured", async () => {
    await setup({}, makeRule({ requireFollow: false, linkButton: "Open repo" }));
    await handleWebhook(postbackEvent("m1", "LINK:repo"), deps);
    expect(api.calls.some((c) => c.method === "GET")).toBe(false); // no follow check
    expect(directMessages()[0].body.message.attachment.payload).toEqual({
      template_type: "button",
      text: "Here you go",
      buttons: [{ type: "web_url", title: "Open repo", url: "https://example.test/repo" }],
    });
  });

  it("asks a non-follower to follow, then sends the link after 'I followed'", async () => {
    await setup({ follows: false });
    await handleWebhook(postbackEvent("m1", "LINK:repo"), deps);
    const ask = directMessages()[0].body.message.attachment.payload;
    expect(ask.text).toBe("Please follow first");
    expect(ask.buttons).toEqual([{ type: "postback", title: "I followed", payload: "CHECK:repo" }]);

    await handleWebhook(postbackEvent("m2", "CHECK:repo"), deps); // tapped without following
    expect(directMessages()[1].body.message.attachment.payload.text).toBe("Please follow first");

    api.state.follows = true;
    await handleWebhook(postbackEvent("m3", "CHECK:repo"), deps);
    expect(directMessages()[2].body.message).toEqual({ text: "Here you go\nhttps://example.test/repo" });
  });

  it("handles a re-delivered button tap only once", async () => {
    await setup();
    await handleWebhook(postbackEvent("m1", "LINK:repo"), deps);
    await handleWebhook(postbackEvent("m1", "LINK:repo"), deps);
    expect(directMessages()).toHaveLength(1);
  });

  it("follows the 'follow check failed' setting", async () => {
    await setup({ follows: "error" });
    await handleWebhook(postbackEvent("m1", "LINK:repo"), deps);
    expect(directMessages()[0].body.message.text).toContain("https://example.test/repo");

    await setup({ follows: "error" });
    await store.saveSettings({ ...(await store.getSettings()), onFollowCheckError: "ask_follow" });
    await handleWebhook(postbackEvent("m1", "LINK:repo"), deps);
    expect(directMessages()[0].body.message.attachment.payload.text).toBe("Please follow first");
  });

  it("treats a text reply as the tap only for people waiting on an automation", async () => {
    await setup();
    await handleWebhook(textEvent("m0", "hi bro, collab?"), deps); // ordinary DM
    expect(api.calls).toHaveLength(0);

    await handleWebhook(commentEvent("c1", "repo"), deps);
    await handleWebhook(textEvent("m1", "YES"), deps);
    expect(directMessages()).toHaveLength(1);
    expect(directMessages()[0].body.message.text).toContain("https://example.test/repo");

    await handleWebhook(textEvent("m2", "thanks!"), deps); // link delivered, no longer pending
    expect(directMessages()).toHaveLength(1);
    const linkEvent = (await store.listEvents(1))[0];
    expect(linkEvent).toMatchObject({ type: "link_sent", username: "tester" });
  });

  it("ignores echoes of our own messages and unknown payloads", async () => {
    await setup();
    await handleWebhook(textEvent("m1", "x", { is_echo: true }), deps);
    await handleWebhook(postbackEvent("m2", "SOMETHING_ELSE"), deps);
    await handleWebhook(postbackEvent("m3", "LINK:deleted-rule"), deps);
    expect(api.calls).toHaveLength(0);
  });
});

describe("stats", () => {
  it("counts the funnel per automation and per day", async () => {
    await setup();
    await handleWebhook(commentEvent("c1", "repo"), deps);
    await handleWebhook(postbackEvent("m1", "LINK:repo"), deps);
    expect((await store.ruleStats()).repo).toEqual({ matched: 1, dms: 1, taps: 1, links: 1 });
    const ov = await store.overview(14, 0);
    expect(ov.series).toHaveLength(14);
    expect(ov.series.at(-1)).toMatchObject({ matched: 1, dms: 1, taps: 1, links: 1 });
    expect(ov.totals.public_reply_sent).toBe(1);
  });
});
