/**
 * Thin client for Meta's Instagram API. Supports both setups Meta offers for this:
 * - "unified":   Instagram API with Unified Login (default for new Meta apps), graph.facebook.com,
 *                Business Integration System User token, calls use the Instagram account ID.
 * - "instagram": Instagram API with Instagram Login, graph.instagram.com, Instagram User token, /me paths.
 * Endpoints and payload shapes follow Meta's docs, listed in docs/META_DOCS.md.
 */
export class InstagramApiError extends Error {
  constructor(public status: number, public body: unknown, where: string) {
    super(`Instagram API ${where} failed (HTTP ${status}): ${summarize(body)}`);
  }
}

function summarize(body: any): string {
  const e = body?.error;
  if (e?.message) return `${e.message}${e.code ? ` [code ${e.code}]` : ""}`;
  return JSON.stringify(body)?.slice(0, 300) ?? "no body";
}

export type Button = { type: "postback"; title: string; payload: string } | { type: "web_url"; title: string; url: string };

export type ApiMode = "unified" | "instagram";

/**
 * Instagram Login tokens start with "IG"; Unified/Facebook Login tokens start with "EAA".
 * IG_API_MODE ("unified" | "instagram") overrides the guess.
 */
export function detectApiMode(token: string, override?: string | null): ApiMode {
  if (override === "unified" || override === "instagram") return override;
  return token.startsWith("IG") ? "instagram" : "unified";
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface Account {
  userId: string;
  username: string;
  picture: string | null;
  followers: number | null;
  mediaCount: number | null;
}

export interface Media {
  id: string;
  caption: string;
  type: string;
  productType: string;
  thumb: string | null;
  permalink: string;
  timestamp: string;
}

export class InstagramClient {
  private base: string;
  private ownIgId: string | null = null;

  constructor(
    private accessToken: string,
    apiVersion: string,
    private fetchImpl: FetchLike = (input, init) => fetch(input, init),
    readonly mode: ApiMode = "instagram",
  ) {
    this.base = `https://${mode === "unified" ? "graph.facebook.com" : "graph.instagram.com"}/${apiVersion}`;
  }

  /**
   * Path prefix for "my account". Instagram Login: /me. Unified Login: /me is the system user,
   * so we look up the shared Instagram account via /me/assigned_instagram_accounts.
   */
  private async accountPath(): Promise<string> {
    if (this.mode === "instagram") return "/me";
    if (!this.ownIgId) {
      const b = await this.call("assignedInstagramAccounts", "/me/assigned_instagram_accounts?fields=id,username");
      const first = b?.data?.[0];
      if (!first?.id) throw new InstagramApiError(200, b, "assignedInstagramAccounts (no Instagram account shared with this token)");
      this.ownIgId = String(first.id);
    }
    return `/${this.ownIgId}`;
  }

  private async call(where: string, path: string, init: RequestInit = {}): Promise<any> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.accessToken}`, ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new InstagramApiError(res.status, body, where);
    return body;
  }

  private postJson(where: string, path: string, payload: unknown) {
    return this.call(where, path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  /** POST /<COMMENT_ID>/replies — public reply under the comment. */
  replyToComment(commentId: string, message: string) {
    return this.call("replyToComment", `/${commentId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ message }).toString(),
    });
  }

  /** POST /<IG_ID>/messages with recipient.comment_id. Meta allows ONE per comment, within 7 days. */
  privateReply(igId: string, commentId: string, message: object): Promise<{ recipient_id?: string; message_id?: string }> {
    return this.postJson("privateReply", `/${igId}/messages`, { recipient: { comment_id: commentId }, message });
  }

  /** POST /<IG_ID>/messages with recipient.id — only inside the 24h window after the user interacts. */
  sendMessage(igId: string, igsid: string, message: object) {
    return this.postJson("sendMessage", `/${igId}/messages`, { recipient: { id: igsid }, message });
  }

  /** GET /<IGSID>?fields=is_user_follow_business — Meta requires user consent (they messaged you first). */
  async userFollowsBusiness(igsid: string): Promise<boolean> {
    const body = await this.call("userFollowsBusiness", `/${igsid}?fields=is_user_follow_business`);
    if (typeof body?.is_user_follow_business !== "boolean") {
      throw new InstagramApiError(200, body, "userFollowsBusiness (field missing)");
    }
    return body.is_user_follow_business;
  }

  /** The connected professional account. */
  async getAccount(): Promise<Account> {
    const acc = await this.accountPath();
    const fields = this.mode === "unified" ? "id,username,profile_picture_url,followers_count,media_count" : "user_id,username,profile_picture_url,followers_count,media_count";
    const b = await this.call("getAccount", `${acc}?fields=${fields}`);
    return {
      userId: String(b.user_id ?? b.id ?? ""),
      username: b.username ?? "",
      picture: b.profile_picture_url ?? null,
      followers: b.followers_count ?? null,
      mediaCount: b.media_count ?? null,
    };
  }

  /** POST /<account>/subscribed_apps — turns on webhook notifications for this account. */
  async subscribeApp(fields: string): Promise<boolean> {
    const acc = await this.accountPath();
    const b = await this.call("subscribeApp", `${acc}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}`, { method: "POST" });
    return b?.success === true;
  }

  /** GET /<account>/media — recent posts and reels, for the post picker. */
  async listMedia(limit = 30): Promise<Media[]> {
    const acc = await this.accountPath();
    const fields = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp";
    const b = await this.call("listMedia", `${acc}/media?fields=${fields}&limit=${limit}`);
    return (b?.data ?? []).map((m: any) => ({
      id: String(m.id),
      caption: m.caption ?? "",
      type: m.media_type ?? "",
      productType: m.media_product_type ?? "",
      thumb: m.thumbnail_url ?? (m.media_type === "VIDEO" ? null : m.media_url) ?? null,
      permalink: m.permalink ?? "",
      timestamp: m.timestamp ?? "",
    }));
  }
}

/**
 * GET https://graph.instagram.com/refresh_access_token — long-lived tokens (60 days) can be refreshed
 * once they are at least 24 hours old and not yet expired.
 */
export async function refreshLongLivedToken(token: string, fetchImpl: FetchLike = (i, init) => fetch(i, init)) {
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
  const res = await fetchImpl(url);
  const body: any = await res.json().catch(() => null);
  if (!res.ok || typeof body?.access_token !== "string") throw new InstagramApiError(res.status, body, "refreshToken");
  return { token: body.access_token as string, expiresIn: Number(body.expires_in) || 0 };
}

export const textMessage = (text: string) => ({ text });

/** Button template: text up to 640 characters with 1-3 buttons. Postback taps arrive as messaging_postbacks. */
export const buttonMessage = (text: string, buttons: Button[]) => ({
  attachment: {
    type: "template",
    payload: { template_type: "button", text, buttons },
  },
});
