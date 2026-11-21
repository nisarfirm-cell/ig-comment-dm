import { DEFAULT_SETTINGS, type Rule, type Settings } from "./rules";

/** Tables are created on first use, so a fresh "Deploy to Cloudflare" needs no migration step. */
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS claims (key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pending (
    user_id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, username TEXT, expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL, type TEXT NOT NULL, rule_id TEXT, user_id TEXT, username TEXT, detail TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS events_ts ON events(ts)`,
  `CREATE INDEX IF NOT EXISTS events_rule ON events(rule_id, type)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL)`,
  // Comments whose private reply failed, so they can be retried inside Meta's 7-day window.
  `CREATE TABLE IF NOT EXISTS failed_dms (
    comment_id TEXT PRIMARY KEY, ig_id TEXT NOT NULL, rule_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT,
    text TEXT, commented_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
  )`,
];

/** Meta allows the private reply up to 7 days after the comment. Keep a margin so a retry isn't sent too late. */
export const RETRY_WINDOW_MS = 7 * 86_400_000 - 30 * 60_000;

export interface FailedDm {
  commentId: string;
  igId: string;
  ruleId: string;
  userId: string;
  username: string | null;
  text: string;
  commentedAt: number;
  attempts: number;
  lastError: string | null;
}

export type EventType =
  | "comment_matched"
  | "dm_sent"
  | "dm_failed"
  | "dm_retry_failed"
  | "public_reply_sent"
  | "public_reply_failed"
  | "skipped_cooldown"
  | "comment_ignored"
  | "button_tap"
  | "link_sent"
  | "follow_requested"
  | "follow_check_failed"
  | "error";

export interface EventRow {
  id: number;
  ts: number;
  type: EventType;
  ruleId: string | null;
  userId: string | null;
  username: string | null;
  detail: string | null;
}

export interface RuleStats {
  matched: number;
  dms: number;
  taps: number;
  links: number;
}

const DAY_MS = 86_400_000;
const FUNNEL: Record<string, keyof RuleStats> = {
  comment_matched: "matched",
  dm_sent: "dms",
  button_tap: "taps",
  link_sent: "links",
};

const ready = new WeakSet<object>();

export class Store {
  constructor(private db: D1Database, private now: () => number = Date.now) {}

  async init(): Promise<void> {
    if (ready.has(this.db)) return;
    await this.db.batch(SCHEMA.map((s) => this.db.prepare(s)));
    ready.add(this.db);
  }

  // ---------- rules ----------
  async listRules(): Promise<Rule[]> {
    const { results } = await this.db.prepare("SELECT data FROM rules ORDER BY created_at DESC").all<{ data: string }>();
    return results.map((r) => JSON.parse(r.data) as Rule);
  }

  async getRule(id: string): Promise<Rule | null> {
    const row = await this.db.prepare("SELECT data FROM rules WHERE id = ?").bind(id).first<{ data: string }>();
    return row ? (JSON.parse(row.data) as Rule) : null;
  }

  async saveRule(rule: Rule): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO rules (id, data, enabled, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, enabled = excluded.enabled`,
      )
      .bind(rule.id, JSON.stringify(rule), rule.enabled ? 1 : 0, rule.createdAt)
      .run();
  }

  async deleteRule(id: string): Promise<boolean> {
    const res = await this.db.prepare("DELETE FROM rules WHERE id = ?").bind(id).run();
    return (res.meta?.changes ?? 0) > 0;
  }

  // ---------- de-duplication ----------
  /**
   * Atomically claims a key for ttlSeconds. True the first time (or after it expired), false otherwise.
   * One SQL statement, so two simultaneous deliveries of the same event cannot both win.
   */
  async claim(key: string, ttlSeconds: number): Promise<boolean> {
    const now = this.now();
    const res = await this.db
      .prepare(
        `INSERT INTO claims (key, expires_at) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET expires_at = excluded.expires_at WHERE claims.expires_at <= ?`,
      )
      .bind(key, now + ttlSeconds * 1000, now)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async release(key: string): Promise<void> {
    await this.db.prepare("DELETE FROM claims WHERE key = ?").bind(key).run();
  }

  // ---------- users waiting for a button tap ----------
  async setPending(userId: string, ruleId: string, username: string | null): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO pending (user_id, rule_id, username, expires_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET rule_id = excluded.rule_id, username = excluded.username, expires_at = excluded.expires_at`,
      )
      .bind(userId, ruleId, username, this.now() + 7 * DAY_MS)
      .run();
  }

  async getPending(userId: string): Promise<{ ruleId: string; username: string | null } | null> {
    const row = await this.db
      .prepare("SELECT rule_id, username FROM pending WHERE user_id = ? AND expires_at > ?")
      .bind(userId, this.now())
      .first<{ rule_id: string; username: string | null }>();
    return row ? { ruleId: row.rule_id, username: row.username } : null;
  }

  async clearPending(userId: string): Promise<void> {
    await this.db.prepare("DELETE FROM pending WHERE user_id = ?").bind(userId).run();
  }

  // ---------- failed private replies (retry queue) ----------
  async saveFailed(f: Omit<FailedDm, "attempts" | "lastError" | "commentedAt"> & { error: string; commentedAt?: number }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO failed_dms (comment_id, ig_id, rule_id, user_id, username, text, commented_at, attempts, last_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(comment_id) DO UPDATE SET last_error = excluded.last_error`,
      )
      .bind(f.commentId, f.igId, f.ruleId, f.userId, f.username, f.text.slice(0, 500), f.commentedAt ?? this.now(), f.error.slice(0, 500))
      .run();
  }

  /** Oldest first, so comments closest to the 7-day limit are retried first. */
  async listFailed(limit: number, maxAttempts: number): Promise<FailedDm[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM failed_dms WHERE commented_at > ? AND attempts < ? ORDER BY commented_at ASC LIMIT ?")
      .bind(this.now() - RETRY_WINDOW_MS, maxAttempts, Math.max(1, Math.floor(limit)))
      .all<any>();
    return results.map((r) => ({
      commentId: r.comment_id,
      igId: r.ig_id,
      ruleId: r.rule_id,
      userId: r.user_id,
      username: r.username,
      text: r.text ?? "",
      commentedAt: r.commented_at,
      attempts: r.attempts,
      lastError: r.last_error,
    }));
  }

  async countFailed(maxAttempts: number): Promise<{ count: number; oldest: number | null }> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS n, MIN(commented_at) AS oldest FROM failed_dms WHERE commented_at > ? AND attempts < ?")
      .bind(this.now() - RETRY_WINDOW_MS, maxAttempts)
      .first<{ n: number; oldest: number | null }>();
    return { count: Number(row?.n ?? 0), oldest: row?.oldest ?? null };
  }

  async markFailedAttempt(commentId: string, error: string): Promise<void> {
    await this.db.prepare("UPDATE failed_dms SET attempts = attempts + 1, last_error = ? WHERE comment_id = ?").bind(error.slice(0, 500), commentId).run();
  }

  async deleteFailed(commentId: string): Promise<void> {
    await this.db.prepare("DELETE FROM failed_dms WHERE comment_id = ?").bind(commentId).run();
  }

  // ---------- activity log ----------
  async logEvent(type: EventType, f: { ruleId?: string; userId?: string; username?: string | null; detail?: string } = {}): Promise<void> {
    await this.db
      .prepare("INSERT INTO events (ts, type, rule_id, user_id, username, detail) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(this.now(), type, f.ruleId ?? null, f.userId ?? null, f.username ?? null, f.detail?.slice(0, 500) ?? null)
      .run();
  }

  async listEvents(limit = 100, ruleId?: string): Promise<EventRow[]> {
    const lim = Math.min(Math.max(1, Math.floor(limit)), 500);
    const stmt = ruleId
      ? this.db.prepare("SELECT * FROM events WHERE rule_id = ? ORDER BY id DESC LIMIT ?").bind(ruleId, lim)
      : this.db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT ?").bind(lim);
    const { results } = await stmt.all<any>();
    return results.map((r) => ({
      id: r.id,
      ts: r.ts,
      type: r.type,
      ruleId: r.rule_id,
      userId: r.user_id,
      username: r.username,
      detail: r.detail,
    }));
  }

  async ruleStats(): Promise<Record<string, RuleStats>> {
    const { results } = await this.db
      .prepare(
        `SELECT rule_id, type, COUNT(*) AS c FROM events
         WHERE rule_id IS NOT NULL AND type IN ('comment_matched','dm_sent','button_tap','link_sent')
         GROUP BY rule_id, type`,
      )
      .all<{ rule_id: string; type: string; c: number }>();
    const out: Record<string, RuleStats> = {};
    for (const r of results) {
      out[r.rule_id] ??= { matched: 0, dms: 0, taps: 0, links: 0 };
      out[r.rule_id][FUNNEL[r.type]] = r.c;
    }
    return out;
  }

  /** Totals for the last `days` days plus one row per day, in the viewer's timezone. */
  async overview(days: number, tzOffsetMinutes: number) {
    const shift = tzOffsetMinutes * 60_000;
    const todayStart = Math.floor((this.now() - shift) / DAY_MS) * DAY_MS + shift;
    const since = todayStart - (days - 1) * DAY_MS;
    const { results } = await this.db
      .prepare(
        `SELECT CAST((ts - ?) / ? AS INTEGER) AS d, type, COUNT(*) AS c FROM events
         WHERE ts >= ? GROUP BY d, type`,
      )
      .bind(since, DAY_MS, since)
      .all<{ d: number; type: string; c: number }>();
    const series = Array.from({ length: days }, (_, i) => ({ day: since + i * DAY_MS, matched: 0, dms: 0, taps: 0, links: 0 }));
    const totals: Record<string, number> = {};
    for (const r of results) {
      totals[r.type] = (totals[r.type] ?? 0) + r.c;
      const key = FUNNEL[r.type];
      if (key && series[r.d]) series[r.d][key] += r.c;
    }
    return { since, series, totals };
  }

  // ---------- settings / key-value ----------
  async getValue(key: string): Promise<string | null> {
    const row = await this.db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
    return row?.value ?? null;
  }

  async setValue(key: string, value: string): Promise<void> {
    await this.db
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(key, value)
      .run();
  }

  async getSettings(): Promise<Settings> {
    const raw = await this.getValue("settings");
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  }

  saveSettings = (s: Settings) => this.setValue("settings", JSON.stringify(s));

  // ---------- login throttling ----------
  /** Returns false when this IP made too many attempts in the current 15-minute window. */
  async allowLogin(ip: string, max = 10): Promise<boolean> {
    const now = this.now();
    const windowMs = 15 * 60_000;
    await this.db
      .prepare(
        `INSERT INTO login_attempts (ip, count, window_start) VALUES (?, 1, ?)
         ON CONFLICT(ip) DO UPDATE SET
           count = CASE WHEN login_attempts.window_start <= ? THEN 1 ELSE login_attempts.count + 1 END,
           window_start = CASE WHEN login_attempts.window_start <= ? THEN excluded.window_start ELSE login_attempts.window_start END`,
      )
      .bind(ip, now, now - windowMs, now - windowMs)
      .run();
    const row = await this.db.prepare("SELECT count FROM login_attempts WHERE ip = ?").bind(ip).first<{ count: number }>();
    return (row?.count ?? 0) <= max;
  }

  async resetLogin(ip: string): Promise<void> {
    await this.db.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
  }

  /** Daily housekeeping: drop expired claims/pending rows and activity older than 90 days. */
  async cleanup(): Promise<void> {
    const now = this.now();
    await this.db.batch([
      this.db.prepare("DELETE FROM claims WHERE expires_at <= ?").bind(now),
      this.db.prepare("DELETE FROM pending WHERE expires_at <= ?").bind(now),
      this.db.prepare("DELETE FROM events WHERE ts < ?").bind(now - 90 * DAY_MS),
      this.db.prepare("DELETE FROM login_attempts WHERE window_start < ?").bind(now - DAY_MS),
      this.db.prepare("DELETE FROM failed_dms WHERE commented_at <= ?").bind(now - RETRY_WINDOW_MS),
    ]);
  }
}
