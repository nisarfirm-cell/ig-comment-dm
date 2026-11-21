import { createSession, passwordMatches, readCookie, SESSION_COOKIE, sessionCookie, verifySession } from "./auth";
import { RETRY_MAX_ATTEMPTS, retryFailed } from "./flow";
import { detectApiMode, InstagramClient } from "./instagram";
import { findRule, parseRuleInput, parseSettingsInput } from "./rules";
import type { Store } from "./store";
import { currentToken, maybeRefreshToken } from "./token";

export interface ApiEnv {
  GRAPH_API_VERSION?: string;
  META_APP_SECRET?: string;
  IG_ACCESS_TOKEN?: string;
  WEBHOOK_VERIFY_TOKEN?: string;
  ADMIN_PASSWORD?: string;
  IG_API_MODE?: string;
}

export interface ApiContext {
  env: ApiEnv;
  store: Store;
  /** Lets tests swap out the network. */
  makeClient?: (token: string) => InstagramClient;
  /** Pause between retried DMs (tests set 0). */
  retryPauseMs?: number;
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function readJson(request: Request): Promise<any> {
  // Requiring a JSON body (plus SameSite=Strict cookies) blocks form-based CSRF.
  if (!(request.headers.get("Content-Type") ?? "").includes("application/json")) throw new Error("expected JSON");
  return request.json();
}

export async function handleApi(request: Request, ctx: ApiContext): Promise<Response> {
  const { env, store } = ctx;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;
  const secure = url.protocol === "https:";

  if (!env.ADMIN_PASSWORD) return json({ error: "admin_password_not_set" }, 503);

  // ----- public: login / logout -----
  if (path === "/api/login" && method === "POST") {
    const ip = request.headers.get("CF-Connecting-IP") ?? "local";
    if (!(await store.allowLogin(ip))) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
    const body = await readJson(request).catch(() => ({}));
    if (!(await passwordMatches(body?.password, env.ADMIN_PASSWORD))) return json({ error: "Wrong password." }, 401);
    await store.resetLogin(ip);
    const s = await createSession(env.ADMIN_PASSWORD);
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(s.value, s.maxAge, secure) });
  }
  if (path === "/api/logout" && method === "POST") {
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0, secure) });
  }

  // ----- everything else needs a session -----
  if (!(await verifySession(readCookie(request, SESSION_COOKIE), env.ADMIN_PASSWORD))) return json({ error: "unauthorized" }, 401);
  if (method !== "GET" && method !== "DELETE" && !(request.headers.get("Content-Type") ?? "").includes("application/json")) {
    return json({ error: "expected JSON" }, 415);
  }

  const client = async () => {
    const t = await currentToken(store, env.IG_ACCESS_TOKEN);
    if (!t.token) throw new Error("IG_ACCESS_TOKEN is not set");
    return ctx.makeClient
      ? ctx.makeClient(t.token)
      : new InstagramClient(t.token, env.GRAPH_API_VERSION || "v27.0", undefined, detectApiMode(t.token, env.IG_API_MODE));
  };

  try {
    if (path === "/api/session" && method === "GET") return json({ ok: true });

    if (path === "/api/overview" && method === "GET") {
      const tz = Number(url.searchParams.get("tz") ?? 0) || 0;
      const [ov, rules, lastWebhook, token] = await Promise.all([
        store.overview(14, tz),
        store.listRules(),
        store.getValue("last_webhook_at"),
        currentToken(store, env.IG_ACCESS_TOKEN),
      ]);
      let account = null;
      let accountError: string | null = null;
      try {
        account = await (await client()).getAccount();
        if (account.username) await store.setValue("account_username", account.username); // for the /privacy page
      } catch (e) {
        accountError = errText(e);
      }
      return json({
        account,
        accountError,
        totals: ov.totals,
        series: ov.series,
        setup: {
          secrets: {
            appSecret: Boolean(env.META_APP_SECRET),
            verifyToken: Boolean(env.WEBHOOK_VERIFY_TOKEN),
            accessToken: Boolean(env.IG_ACCESS_TOKEN),
          },
          tokenWorks: Boolean(account),
          tokenSource: token.source,
          tokenRefreshedAt: token.refreshedAt,
          lastWebhookAt: lastWebhook ? Number(lastWebhook) : null,
          lastWebhookAttemptAt: Number((await store.getValue("last_webhook_attempt_at")) ?? 0) || null,
          rules: rules.length,
          activeRules: rules.filter((r) => r.enabled).length,
          webhookUrl: `${url.origin}/webhook`,
          redirectUrl: `${url.origin}/auth/callback`,
          apiMode: detectApiMode(token.token, env.IG_API_MODE),
        },
      });
    }

    if (path === "/api/setup/verify-token" && method === "GET") {
      return json({ verifyToken: env.WEBHOOK_VERIFY_TOKEN ?? "" });
    }

    if (path === "/api/setup/subscribe" && method === "POST") {
      const ok = await (await client()).subscribeApp("comments,messages,messaging_postbacks");
      return ok ? json({ ok }) : json({ error: "Instagram did not confirm the subscription." }, 502);
    }

    if (path === "/api/rules" && method === "GET") {
      const [rules, stats] = await Promise.all([store.listRules(), store.ruleStats()]);
      return json({ rules: rules.map((r) => ({ ...r, stats: stats[r.id] ?? { matched: 0, dms: 0, taps: 0, links: 0 } })) });
    }
    if (path === "/api/rules" && method === "POST") {
      const { rule, errors } = parseRuleInput(await readJson(request));
      if (!rule) return json({ error: "Please fix the highlighted fields.", errors }, 422);
      await store.saveRule(rule);
      return json({ rule }, 201);
    }

    const ruleMatch = /^\/api\/rules\/([A-Za-z0-9_-]+)(\/enabled)?$/.exec(path);
    if (ruleMatch) {
      const existing = await store.getRule(ruleMatch[1]);
      if (!existing) return json({ error: "Automation not found." }, 404);
      if (ruleMatch[2] && method === "POST") {
        const body = await readJson(request);
        const updated = { ...existing, enabled: Boolean(body?.enabled), updatedAt: Date.now() };
        await store.saveRule(updated);
        return json({ rule: updated });
      }
      if (!ruleMatch[2] && method === "GET") return json({ rule: existing });
      if (!ruleMatch[2] && method === "PUT") {
        const { rule, errors } = parseRuleInput(await readJson(request), existing);
        if (!rule) return json({ error: "Please fix the highlighted fields.", errors }, 422);
        await store.saveRule(rule);
        return json({ rule });
      }
      if (!ruleMatch[2] && method === "DELETE") {
        await store.deleteRule(existing.id);
        return json({ ok: true });
      }
    }

    if (path === "/api/simulate" && method === "POST") {
      const body = await readJson(request);
      const rule = findRule(await store.listRules(), body?.mediaId || undefined, String(body?.text ?? ""));
      return json({ rule: rule ? { id: rule.id, name: rule.name } : null });
    }

    if (path === "/api/media" && method === "GET") {
      return json({ media: await (await client()).listMedia(30) });
    }

    if (path === "/api/events" && method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? 100);
      return json({ events: await store.listEvents(limit, url.searchParams.get("rule") ?? undefined) });
    }

    if (path === "/api/settings" && method === "GET") {
      const t = await currentToken(store, env.IG_ACCESS_TOKEN);
      return json({
        settings: await store.getSettings(),
        token: { source: t.source, refreshedAt: t.refreshedAt, mode: detectApiMode(t.token, env.IG_API_MODE) },
      });
    }
    if (path === "/api/settings" && method === "PUT") {
      // Partial updates are fine: fields that are not sent keep their current value.
      const { settings, errors } = parseSettingsInput({ ...(await store.getSettings()), ...(await readJson(request)) });
      if (!settings) return json({ error: "Please fix the highlighted fields.", errors }, 422);
      await store.saveSettings(settings);
      return json({ settings });
    }

    if (path === "/api/review-progress" && method === "GET") {
      return json({ progress: JSON.parse((await store.getValue("review_progress")) ?? "{}") });
    }
    if (path === "/api/review-progress" && method === "PUT") {
      const body = await readJson(request);
      const progress: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(body?.progress ?? {}).slice(0, 30)) {
        if (/^[a-z_]{1,30}$/.test(k)) progress[k] = Boolean(v);
      }
      await store.setValue("review_progress", JSON.stringify(progress));
      return json({ progress });
    }

    if (path === "/api/failed" && method === "GET") {
      return json(await store.countFailed(RETRY_MAX_ATTEMPTS));
    }
    if (path === "/api/failed/retry" && method === "POST") {
      // Small batches with a pause between DMs, so a retry doesn't run into Meta's rate limit again.
      return json(await retryFailed({ ig: await client(), store }, { max: 10, pauseMs: ctx.retryPauseMs ?? 1500 }));
    }

    if (path === "/api/token/refresh" && method === "POST") {
      const r = await maybeRefreshToken(store, env.IG_ACCESS_TOKEN, { force: true, modeOverride: env.IG_API_MODE });
      return json(r);
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: errText(e) }, 502);
  }
}
