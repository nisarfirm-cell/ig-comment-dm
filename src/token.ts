import { detectApiMode, refreshLongLivedToken, type FetchLike } from "./instagram";
import { sha256Hex } from "./signature";
import type { Store } from "./store";

/**
 * The access token starts life as the IG_ACCESS_TOKEN secret. The daily cron refreshes it and keeps
 * the refreshed copy in D1. If you later put a NEW token into the secret, it wins again
 * (we remember which secret the stored copy came from).
 */
export interface TokenInfo {
  token: string;
  source: "secret" | "refreshed" | "missing";
  refreshedAt: number | null;
}

export async function currentToken(store: Store, secretToken: string | undefined): Promise<TokenInfo> {
  if (!secretToken) return { token: "", source: "missing", refreshedAt: null };
  const raw = await store.getValue("ig_token");
  if (raw) {
    const saved = JSON.parse(raw) as { token: string; seed: string; refreshedAt: number };
    if (saved.seed === (await sha256Hex(secretToken))) {
      return { token: saved.token, source: "refreshed", refreshedAt: saved.refreshedAt };
    }
  }
  return { token: secretToken, source: "secret", refreshedAt: null };
}

/** Refreshes when the token is older than `minAgeDays` (or always when forced). */
export async function maybeRefreshToken(
  store: Store,
  secretToken: string | undefined,
  opts: { force?: boolean; minAgeDays?: number; now?: number; fetchImpl?: FetchLike; modeOverride?: string } = {},
): Promise<{ refreshed: boolean; reason: string }> {
  const now = opts.now ?? Date.now();
  const info = await currentToken(store, secretToken);
  if (info.source === "missing") return { refreshed: false, reason: "IG_ACCESS_TOKEN is not set" };
  // Unified Login gives a system-user token; its expiry is set in the Meta configuration (default: never).
  if (detectApiMode(info.token, opts.modeOverride) === "unified") {
    return { refreshed: false, reason: "Unified login tokens don't need refreshing" };
  }
  const minAge = (opts.minAgeDays ?? 7) * 86_400_000;
  if (!opts.force && info.refreshedAt && now - info.refreshedAt < minAge) return { refreshed: false, reason: "token is still fresh" };

  const { token } = await refreshLongLivedToken(info.token, opts.fetchImpl);
  await store.setValue("ig_token", JSON.stringify({ token, seed: await sha256Hex(secretToken!), refreshedAt: now }));
  return { refreshed: true, reason: "ok" };
}
