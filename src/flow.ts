import { InstagramClient, buttonMessage, textMessage } from "./instagram";
import { findRule, linkPlainText, ruleMatches, type Rule, type Settings } from "./rules";
import type { Store } from "./store";

export interface Deps {
  ig: InstagramClient;
  store: Store;
}

const DAY = 86_400;

export function jsonLog(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...fields }));
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Handle one webhook body from Meta (already signature-checked). */
export async function handleWebhook(body: any, deps: Deps): Promise<void> {
  if (body?.object !== "instagram" || !Array.isArray(body.entry)) {
    jsonLog("ignored_payload", { object: body?.object });
    return;
  }
  for (const entry of body.entry) {
    const igId = String(entry.id ?? "");
    for (const change of entry.changes ?? []) {
      if (change?.field !== "comments") continue; // live_comments etc. are not handled
      await safely(deps, () => handleComment(igId, change.value, deps));
    }
    for (const event of entry.messaging ?? []) {
      await safely(deps, () => handleMessaging(igId, event, deps));
    }
  }
}

async function safely(deps: Deps, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    jsonLog("error", { error: errText(e) });
    await deps.store.logEvent("error", { detail: errText(e) }).catch(() => {});
  }
}

/** Stable pick so a re-delivered comment would get the same reply text. */
function pick<T>(list: T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export async function handleComment(igId: string, value: any, deps: Deps): Promise<void> {
  const { ig, store } = deps;
  const commentId: string | undefined = value?.id ?? value?.comment_id;
  const userId: string | undefined = value?.from?.id;
  const username: string | null = value?.from?.username ?? null;
  const text: string = value?.text ?? "";
  const mediaId: string | undefined = value?.media?.id;
  if (!commentId || !userId) return jsonLog("comment_skipped", { reason: "missing_ids" });

  const rules = await store.listRules();

  // Our own public reply also arrives as a comment event. Never answer ourselves.
  if (userId === igId) {
    jsonLog("comment_skipped", { reason: "own_comment", commentId });
    // If the owner tested with their own account, say why nothing happened.
    if (rules.some((r) => r.enabled && ruleMatches(r, text))) {
      await store.logEvent("comment_ignored", {
        userId,
        username,
        detail: `Your own comment "${text.slice(0, 80)}" was ignored. Test from a second account added as Instagram Tester.`,
      });
    }
    return;
  }

  const rule = findRule(rules, mediaId, text);
  if (!rule) {
    jsonLog("comment_skipped", { reason: "no_keyword_match", commentId, mediaId });
    const onOtherPost = rules.find((r) => r.enabled && r.mediaId !== "any" && r.mediaId !== mediaId && ruleMatches(r, text));
    await store.logEvent("comment_ignored", {
      userId,
      username,
      detail: onOtherPost
        ? `Keyword matched "${onOtherPost.name}", but that automation only runs on a different post.`
        : `No automation keyword in: "${text.slice(0, 80)}"`,
    });
    return;
  }

  if (!(await store.claim(`comment:${commentId}`, 8 * DAY))) {
    return jsonLog("comment_skipped", { reason: "duplicate_comment", commentId });
  }

  const settings = await store.getSettings();
  const userKey = `user:${userId}:${rule.id}`;
  if (settings.cooldownDays > 0 && !(await store.claim(userKey, settings.cooldownDays * DAY))) {
    await store.logEvent("skipped_cooldown", { ruleId: rule.id, userId, username, detail: text });
    return;
  }

  await store.logEvent("comment_matched", { ruleId: rule.id, userId, username, detail: text });

  // 1) The one private reply Meta allows for this comment. Button first, plain text if refused.
  let sent: { recipientId?: string; usedButton: boolean };
  try {
    sent = await sendPrivateReply(ig, igId, commentId, rule, settings);
  } catch (e) {
    await store.release(userKey); // let them try again with a new comment
    await store.logEvent("dm_failed", { ruleId: rule.id, userId, username, detail: errText(e) });
    // Keep it so "Retry failed" can send it later (still inside Meta's 7-day window).
    await store.saveFailed({ commentId, igId, ruleId: rule.id, userId, username, text, error: errText(e) });
    return;
  }

  await afterDmSent(ig, store, commentId, rule, userId, username, sent, sent.usedButton ? "with button" : "plain text fallback");
}

async function sendPrivateReply(ig: InstagramClient, igId: string, commentId: string, rule: Rule, settings: Settings) {
  try {
    const res = await ig.privateReply(igId, commentId, buttonMessage(rule.dmText, [{ type: "postback", title: rule.dmButton, payload: `LINK:${rule.id}` }]));
    return { recipientId: res?.recipient_id, usedButton: true };
  } catch (e) {
    if (isRateLimit(e)) throw e; // a text retry would hit the same limit
    jsonLog("private_reply_button_failed", { commentId, error: errText(e) });
    const res = await ig.privateReply(igId, commentId, textMessage(`${rule.dmText}

${settings.fallbackHint}`));
    return { recipientId: res?.recipient_id, usedButton: false };
  }
}

async function afterDmSent(
  ig: InstagramClient,
  store: Store,
  commentId: string,
  rule: Rule,
  userId: string,
  username: string | null,
  sent: { recipientId?: string },
  detail: string,
) {
  await store.setPending(userId, rule.id, username);
  if (sent.recipientId && sent.recipientId !== userId) await store.setPending(sent.recipientId, rule.id, username);
  await store.logEvent("dm_sent", { ruleId: rule.id, userId, username, detail });

  // 2) Public reply, only after the DM really went out ("Check your DM" must be true).
  if (rule.publicReplies.length) {
    const reply = pick(rule.publicReplies, commentId);
    try {
      await ig.replyToComment(commentId, reply);
      await store.logEvent("public_reply_sent", { ruleId: rule.id, userId, username, detail: reply });
    } catch (e) {
      await store.logEvent("public_reply_failed", { ruleId: rule.id, userId, username, detail: errText(e) });
    }
  }
}

/** Meta's rate-limit error codes (4, 17, 32, 613) and the Instagram "too many" messages. */
export function isRateLimit(e: unknown): boolean {
  const body: any = (e as any)?.body;
  const code = Number(body?.error?.code);
  if ([4, 17, 32, 613].includes(code) || (e as any)?.status === 429) return true;
  return /rate limit|too many|limit reached|request limit/i.test(errText(e));
}

export const RETRY_MAX_ATTEMPTS = 3;

export interface RetryResult {
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
  stoppedForRateLimit: boolean;
}

/**
 * Re-sends the private reply for comments whose DM failed, oldest first, one at a time with a pause,
 * and stops at the first rate-limit error. Each comment is tried at most RETRY_MAX_ATTEMPTS times.
 */
export async function retryFailed(
  deps: Deps,
  opts: { max?: number; pauseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<RetryResult> {
  const { ig, store } = deps;
  const max = Math.min(Math.max(1, opts.max ?? 10), 25);
  const pauseMs = opts.pauseMs ?? 1500;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const settings = await store.getSettings();
  const result: RetryResult = { sent: 0, failed: 0, skipped: 0, remaining: 0, stoppedForRateLimit: false };

  const rows = await store.listFailed(max, RETRY_MAX_ATTEMPTS);
  let calledApi = false;
  for (const f of rows) {
    const rule = await store.getRule(f.ruleId);
    if (!rule || !rule.enabled) {
      await store.deleteFailed(f.commentId); // automation deleted or paused: don't message people for it
      result.skipped++;
      continue;
    }
    const userKey = `user:${f.userId}:${rule.id}`;
    if (settings.cooldownDays > 0 && !(await store.claim(userKey, settings.cooldownDays * DAY))) {
      await store.deleteFailed(f.commentId); // they already got this automation's DM from another comment
      result.skipped++;
      continue;
    }

    if (calledApi && pauseMs > 0) await sleep(pauseMs);
    calledApi = true;
    try {
      const sent = await sendPrivateReply(ig, f.igId, f.commentId, rule, settings);
      await store.deleteFailed(f.commentId);
      await afterDmSent(ig, store, f.commentId, rule, f.userId, f.username, sent, `retry · ${sent.usedButton ? "with button" : "plain text fallback"}`);
      result.sent++;
    } catch (e) {
      await store.release(userKey);
      await store.markFailedAttempt(f.commentId, errText(e));
      await store.logEvent("dm_retry_failed", { ruleId: rule.id, userId: f.userId, username: f.username, detail: errText(e) });
      result.failed++;
      if (isRateLimit(e)) {
        result.stoppedForRateLimit = true;
        break;
      }
    }
  }
  result.remaining = (await store.countFailed(RETRY_MAX_ATTEMPTS)).count;
  return result;
}

export async function handleMessaging(igId: string, event: any, deps: Deps): Promise<void> {
  const { store } = deps;
  const senderId: string | undefined = event?.sender?.id;
  if (!senderId || senderId === igId || event?.message?.is_echo) return; // our own outgoing messages

  const payload: string | undefined = event?.postback?.payload ?? event?.message?.quick_reply?.payload;
  const mid: string | undefined = event?.postback?.mid ?? event?.message?.mid;

  const pending = await store.getPending(senderId);
  let ruleId: string | undefined;
  const m = typeof payload === "string" ? /^(LINK|CHECK):([A-Za-z0-9_-]+)$/.exec(payload) : null;
  if (m) ruleId = m[2];
  else if (typeof event?.message?.text === "string" && pending) ruleId = pending.ruleId; // text reply = tap
  if (!ruleId) return; // ordinary DM: leave it for a human

  if (mid && !(await store.claim(`mid:${mid}`, 3 * DAY))) return jsonLog("message_skipped", { reason: "duplicate_message", mid });

  const rule = await store.getRule(ruleId);
  if (!rule) return jsonLog("message_skipped", { reason: "unknown_rule", ruleId });

  const username = pending?.username ?? null;
  await store.logEvent("button_tap", { ruleId, userId: senderId, username, detail: m?.[1] === "CHECK" ? "I followed" : "get link" });
  await deliver(igId, senderId, username, rule, await store.getSettings(), deps);
}

async function deliver(igId: string, userId: string, username: string | null, rule: Rule, settings: Settings, deps: Deps) {
  const { ig, store } = deps;

  let follows = true;
  if (rule.requireFollow) {
    try {
      follows = await ig.userFollowsBusiness(userId);
    } catch (e) {
      follows = settings.onFollowCheckError === "send_link";
      await store.logEvent("follow_check_failed", { ruleId: rule.id, userId, username, detail: errText(e) });
    }
  }

  if (!follows) {
    await ig.sendMessage(igId, userId, buttonMessage(rule.followText, [{ type: "postback", title: rule.followButton, payload: `CHECK:${rule.id}` }]));
    await store.logEvent("follow_requested", { ruleId: rule.id, userId, username });
    return;
  }

  const message =
    rule.linkButton && rule.linkUrl
      ? buttonMessage(rule.linkText || "Here you go 👇", [{ type: "web_url", title: rule.linkButton, url: rule.linkUrl }])
      : textMessage(linkPlainText(rule));
  await ig.sendMessage(igId, userId, message);
  await store.clearPending(userId);
  await store.logEvent("link_sent", { ruleId: rule.id, userId, username });
}
