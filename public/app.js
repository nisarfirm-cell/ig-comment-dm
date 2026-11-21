// AutoDM dashboard. Plain ES module, no build step.
// Every value that comes from the server or the user is passed through esc() before it reaches innerHTML.

/* ======================= utils ======================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nf = new Intl.NumberFormat();
const num = (n) => nf.format(Number(n) || 0);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const clone = (o) => JSON.parse(JSON.stringify(o));

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l2-5.2a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.4-8.5h.5a8.5 8.5 0 0 1 8 8z"/>',
  comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  tap: '<path d="M9 11V5a2 2 0 1 1 4 0v5"/><path d="M13 10a2 2 0 1 1 4 0v2"/><path d="M17 11a2 2 0 1 1 4 0v4a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L4.3 16a2 2 0 0 1 3.1-2.5L9 15"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 21v-5h5M21 3v5h-5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  play: '<path d="m6 4 14 8-14 8z"/>',
};
const icon = (name, cls = "") => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
const BUBBLE_PATH = "M7 10a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-6l-5 4.5V22a4 4 0 0 1-3-4z";
const BOLT_PATH = "M17.5 9.5 13 16h3.2l-1.2 5 4.5-6.5h-3.2z";
const BRAND_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true"><path class="b1" d="${BUBBLE_PATH}"/><path class="b2" d="${BOLT_PATH}"/></svg>`;

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
const fullTime = (ts) => new Date(ts).toLocaleString();

function toast(message, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${kind === "error" ? "error" : ""}`;
  el.innerHTML = `${icon(kind === "error" ? "alert" : "check")}<span>${esc(message)}</span>`;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), kind === "error" ? 6000 : 3200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
  } catch {
    toast("Could not copy. Select the text and copy it manually.", "error");
  }
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (res.status === 503 && data?.error === "admin_password_not_set") {
    renderNoPassword();
    throw new ApiError("Admin password not set", 503, data);
  }
  if (res.status === 401 && path !== "/api/login") {
    renderLogin();
    throw new ApiError("Signed out", 401, data);
  }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

const reportError = (e) => {
  if (e instanceof ApiError && (e.status === 401 || e.status === 503)) return;
  toast(e.message || String(e), "error");
};

/* Same matching rules as the Worker (src/rules.ts), for the live "test a comment" box. */
const normalize = (t) => t.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const isWordChar = (ch) => ch !== "" && /[\p{L}\p{N}\p{M}_]/u.test(ch);
function keywordMatches(comment, keyword, mode = "word") {
  const text = normalize(comment);
  const kw = normalize(keyword);
  if (!kw || !text) return false;
  if (mode === "exact") return text === kw;
  if (mode === "contains") return text.includes(kw);
  let from = 0;
  for (;;) {
    const i = text.indexOf(kw, from);
    if (i === -1) return false;
    const before = i === 0 ? "" : [...text.slice(0, i)].pop();
    const rest = text.slice(i + kw.length);
    const after = rest ? [...rest][0] : "";
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = i + 1;
  }
}

/* ======================= theme ======================= */
function currentTheme() {
  const set = document.documentElement.getAttribute("data-theme");
  if (set) return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("autodm-theme", next);
  } catch {}
  $$("[data-action=theme]").forEach((b) => (b.innerHTML = icon(next === "dark" ? "sun" : "moon")));
}

/* ======================= state ======================= */
const state = {
  account: null,
  overview: null,
  rules: null,
  media: null,
  reviewProgress: null,
  setupLeft: null,
  dirty: false,
};

async function loadOverview(tz = new Date().getTimezoneOffset()) {
  const [ov, rp] = await Promise.all([api(`/api/overview?tz=${tz}`), api("/api/review-progress")]);
  state.overview = ov;
  state.account = ov.account;
  state.reviewProgress = rp.progress;
  state.setupLeft = setupSteps(ov).filter((s) => !s.done).length;
  return ov;
}

const EVENT_META = {
  comment_matched: { label: "Comment matched", tone: "blue", icon: "comment" },
  dm_sent: { label: "DM sent", tone: "violet", icon: "send" },
  public_reply_sent: { label: "Public reply", tone: "slate", icon: "chat" },
  button_tap: { label: "Button tapped", tone: "amber", icon: "tap" },
  follow_requested: { label: "Asked to follow", tone: "amber", icon: "userPlus" },
  link_sent: { label: "Link delivered", tone: "green", icon: "link" },
  skipped_cooldown: { label: "Skipped · cooldown", tone: "slate", icon: "clock" },
  comment_ignored: { label: "Comment ignored", tone: "slate", icon: "comment" },
  dm_failed: { label: "DM failed", tone: "red", icon: "alert" },
  dm_retry_failed: { label: "Retry failed", tone: "red", icon: "alert" },
  public_reply_failed: { label: "Reply failed", tone: "red", icon: "alert" },
  follow_check_failed: { label: "Follow check failed", tone: "red", icon: "alert" },
  error: { label: "Error", tone: "red", icon: "alert" },
};
const evMeta = (t) => EVENT_META[t] ?? { label: t, tone: "slate", icon: "info" };

const TEMPLATE = {
  name: "Repo link",
  enabled: true,
  mediaId: "any",
  mediaCaption: "",
  mediaThumb: "",
  keywords: ["REPO"],
  match: "word",
  publicReplies: ["Check your DM 📩", "Sent! Check your inbox 🚀"],
  dmText: "Hey! 👋 Thanks for commenting. Tap the button below and I'll send you the link.",
  dmButton: "Send me the link",
  requireFollow: true,
  followText: "Almost there! Follow the account first, then tap the button below 🙂",
  followButton: "I followed ✅",
  linkText: "Here you go 🎉",
  linkUrl: "",
  linkButton: "Open link",
};

/* ======================= shell ======================= */
const NAV = [
  { href: "#/", key: "overview", label: "Overview", icon: "grid" },
  { href: "#/automations", key: "automations", label: "Automations", icon: "bolt" },
  { href: "#/activity", key: "activity", label: "Activity", icon: "activity" },
  { href: "#/setup", key: "setup", label: "Setup", icon: "book" },
  { href: "#/approval", key: "approval", label: "Get approved", icon: "shield" },
  { href: "#/settings", key: "settings", label: "Settings", icon: "settings" },
];

function avatarHtml(account, cls = "") {
  if (account?.picture) return `<img class="avatar ${cls}" src="${esc(account.picture)}" alt="" referrerpolicy="no-referrer" />`;
  const letter = (account?.username || "?").slice(0, 1).toUpperCase();
  return `<span class="avatar ${cls}">${esc(letter)}</span>`;
}

function renderShell(activeKey, contentHtml) {
  const a = state.account;
  const activeCount = state.rules ? state.rules.filter((r) => r.enabled).length : null;
  $("#app").innerHTML = `
    <div class="shell">
      <aside class="sidebar" aria-label="Main navigation">
        <div class="brand"><span class="brand-mark">${BRAND_SVG}</span><div>AutoDM<small>Comment → DM automations</small></div></div>
        <div class="nav-label">Workspace</div>
        ${NAV.map(
          (n) => `<a class="nav-item ${n.key === activeKey ? "active" : ""}" href="${n.href}" ${n.key === activeKey ? 'aria-current="page"' : ""}>
            ${icon(n.icon)}<span>${n.label}</span>${n.key === "automations" && activeCount !== null ? `<span class="count">${activeCount}</span>` : ""}${
              n.key === "setup" && state.setupLeft ? `<span class="count todo" title="Steps left">${state.setupLeft}</span>` : ""
            }
          </a>`,
        ).join("")}
        <div class="sidebar-foot">
          <div class="account-card">
            ${a ? `<span class="avatar-ring">${avatarHtml(a)}</span>` : `<span class="avatar">${icon("lock", "sm")}</span>`}
            <div class="meta">
              <b>${a ? "@" + esc(a.username) : "Not connected"}</b>
              <span>${a ? (a.followers != null ? num(a.followers) + " followers" : "Instagram connected") : "Check Setup"}</span>
            </div>
          </div>
          <div class="foot-row">
            <button class="btn sm ghost icon-only" data-action="theme" title="Toggle theme" aria-label="Toggle theme">${icon(currentTheme() === "dark" ? "sun" : "moon")}</button>
            <span class="spacer"></span>
            <button class="btn sm ghost" data-action="logout">${icon("logout", "sm")} Sign out</button>
          </div>
        </div>
      </aside>
      <main class="main" id="main">${contentHtml}</main>
    </div>`;
}

function pageHead(title, sub, actionsHtml = "", crumb = "") {
  return `<div class="page-head"><div>${crumb}<h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="row wrap">${actionsHtml}</div></div>`;
}

/* ======================= auth screens ======================= */
function renderLogin() {
  state.dirty = false;
  $("#app").innerHTML = `
    <div class="auth">
      <form class="card auth-card" id="login-form">
        <div class="brand"><span class="brand-mark">${BRAND_SVG}</span>AutoDM</div>
        <h1>Welcome back</h1>
        <p>Sign in to manage your Instagram automations.</p>
        <div class="field">
          <label class="label" for="pw">Dashboard password</label>
          <input class="input" id="pw" name="password" type="password" autocomplete="current-password" required autofocus />
          <div class="err" id="login-err" role="alert"></div>
        </div>
        <button class="btn primary block" style="margin-top:18px;height:42px" type="submit">Sign in</button>
        <p class="hint" style="text-align:center;margin-top:16px">This is the <code>ADMIN_PASSWORD</code> secret you set when deploying.</p>
      </form>
    </div>`;
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.submitter ?? $("#login-form button");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      await api("/api/login", { method: "POST", body: { password: $("#pw").value } });
      await boot();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 503)) {
        $("#login-err").textContent = err.message;
        btn.disabled = false;
        btn.textContent = "Sign in";
      }
    }
  });
}

function renderNoPassword() {
  $("#app").innerHTML = `
    <div class="auth"><div class="card auth-card">
      <div class="brand"><span class="brand-mark">${BRAND_SVG}</span>AutoDM</div>
      <h1>One more step</h1>
      <p>Set a dashboard password so only you can open this page.</p>
      <div class="codeblock">npx wrangler secret put ADMIN_PASSWORD</div>
      <p class="hint" style="margin-top:14px">Or in Cloudflare: Workers &amp; Pages → your worker → Settings → Variables and Secrets → add <code>ADMIN_PASSWORD</code> as a secret. Then reload this page.</p>
    </div></div>`;
}

/* ======================= overview ======================= */
function chartSvg(series) {
  const W = 720, H = 230, L = 36, R = 8, T = 12, B = 28;
  const n = series.length;
  const max = Math.max(4, ...series.map((d) => Math.max(d.matched, d.links)));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const bw = (W - L - R) / n;
  const fmtDay = (ts) => new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  let grid = "";
  for (let i = 0; i <= 4; i++) {
    const v = step * i;
    grid += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  const bars = series
    .map((d, i) => {
      const cx = L + bw * i + bw / 2;
      const wa = Math.min(26, bw * 0.62), wb = Math.min(12, bw * 0.3);
      const ha = Math.max(d.matched ? 3 : 0, y(0) - y(d.matched));
      const hb = Math.max(d.links ? 3 : 0, y(0) - y(d.links));
      const label = i % 2 === n % 2 ? "" : `<text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(fmtDay(d.day))}</text>`;
      return `<g class="day"><title>${esc(fmtDay(d.day))}: ${d.matched} matched, ${d.dms} DMs, ${d.links} links</title>
        <rect x="${L + bw * i}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>
        <rect class="bar-a" x="${cx - wa / 2}" y="${y(0) - ha}" width="${wa}" height="${ha}" rx="6"/>
        <rect class="bar-b" x="${cx - wb / 2}" y="${y(0) - hb}" width="${wb}" height="${hb}" rx="4"/>${label}</g>`;
    })
    .join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Comments matched and links delivered per day, last 14 days">${grid}${bars}</svg>`;
}

function kpi(label, value, sub, tone, ic) {
  return `<div class="card kpi"><div class="kpi-top"><span class="kpi-icon tone-${tone}">${icon(ic)}</span>${esc(label)}</div>
    <div class="value">${num(value)}</div><div class="sub">${sub}</div></div>`;
}

/** The six setup steps. `rp` is the approval-kit progress. */
function setupSteps(ov, rp = state.reviewProgress ?? {}) {
  const s = ov.setup;
  return [
    { id: "app", title: "Create a Meta app", done: s.tokenWorks },
    { id: "connect", title: "Connect Instagram", done: s.tokenWorks && s.secrets.appSecret },
    { id: "webhook", title: "Connect the webhook", done: Boolean(s.lastWebhookAt) },
    { id: "automation", title: "Create an automation", done: s.activeRules > 0 },
    { id: "test", title: "Test with a second account", done: (ov.totals.dm_sent || 0) > 0 },
    { id: "approve", title: "Get approved by Meta", done: Boolean(rp.live) },
  ];
}

async function viewOverview() {
  renderShell("overview", `<div class="page">${pageHead("Overview", "Loading…")}<div class="grid grid-4">${'<div class="card kpi skeleton" style="height:132px"></div>'.repeat(4)}</div></div>`);
  const [ov, ev] = await Promise.all([loadOverview(), api("/api/events?limit=6")]);
  const t = ov.totals;
  const matched = t.comment_matched || 0, dms = t.dm_sent || 0, taps = t.button_tap || 0, links = t.link_sent || 0;
  const steps = setupSteps(ov);
  const allDone = steps.every((s) => s.done);
  const live = ov.setup.lastWebhookAt && Date.now() - ov.setup.lastWebhookAt < 7 * 86400000;
  const hello = ov.account ? `Hi @${ov.account.username} 👋` : "Hi 👋"; // pageHead escapes it
  const statusPill = `<span class="pill"><span class="dot ${live ? "live" : ov.setup.tokenWorks ? "warn" : "off"}"></span>${
    live ? "Live · receiving events" : ov.setup.tokenWorks ? "Waiting for first webhook" : "Not connected"
  }</span>`;

  const html = `<div class="page">
    ${pageHead(hello, "Here is how your comment automations did in the last 14 days.", `${statusPill}<a class="btn primary" href="#/automations/new">${icon("plus")} New automation</a>`)}
    ${allDone ? "" : `
      <div class="callout strong" style="margin-bottom:16px;align-items:center">
        ${icon("sparkle")}<div style="flex:1"><b>Finish setup · ${steps.filter((s) => s.done).length} of ${steps.length} done</b><p>Next: ${esc(steps.find((s) => !s.done).title)}</p></div>
        <a class="btn sm" href="#/setup">Continue setup</a>
      </div>`}
    <div class="grid grid-4">
      ${kpi("Comments matched", matched, "keyword comments", "blue", "comment")}
      ${kpi("DMs sent", dms, `${pct(dms, matched)}% of matched`, "violet", "send")}
      ${kpi("Button taps", taps, `${pct(taps, dms)}% of DMs`, "amber", "tap")}
      ${kpi("Links delivered", links, `${pct(links, matched)}% conversion`, "green", "link")}
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><div><h3>Daily activity</h3><p>Last 14 days</p></div>
          <div class="legend"><span><i class="la"></i>Matched</span><span><i class="lb"></i>Links</span></div></div>
        <div style="padding:10px 14px 14px">${chartSvg(ov.series)}</div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Conversion funnel</h3><p>From comment to link</p></div></div>
        <div class="card-pad">
          ${[["Comment matched", matched], ["DM delivered", dms], ["Button tapped", taps], ["Link delivered", links]]
            .map(([l, v]) => `<div class="funnel-row"><div class="top"><span>${l}</span><span>${num(v)} · ${pct(v, matched)}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${matched ? Math.max(2, pct(v, matched)) : 0}%"></div></div></div>`)
            .join("")}
          ${t.follow_requested ? `<p class="hint" style="margin-top:16px">${icon("userPlus", "sm")} ${num(t.follow_requested)} times people were asked to follow first.</p>` : ""}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><div><h3>Recent activity</h3><p>What happened most recently</p></div><a class="btn sm" href="#/activity">View all</a></div>
      ${ev.events.length ? `<ul class="feed">${ev.events.map(feedItem).join("")}</ul>` : `<p class="muted card-pad">Nothing yet. When someone comments a keyword, it shows up here.</p>`}
    </div>
  </div>`;
  renderShell("overview", html);
}

function ruleName(id) {
  return state.rules?.find((r) => r.id === id)?.name ?? null;
}

function feedItem(e) {
  const m = evMeta(e.type);
  const who = e.username ? `@${esc(e.username)}` : e.userId ? "Someone" : "System";
  const rn = ruleName(e.ruleId);
  return `<li><span class="ev-ico tone-${m.tone}">${icon(m.icon, "sm")}</span>
    <div class="txt"><b>${who}</b> · ${esc(m.label)}${rn ? ` <span>in ${esc(rn)}</span>` : ""}${e.detail ? `<div class="muted small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.detail)}</div>` : ""}</div>
    <time datetime="${new Date(e.ts).toISOString()}" title="${esc(fullTime(e.ts))}">${timeAgo(e.ts)}</time></li>`;
}

/* ======================= automations list ======================= */
async function loadRules() {
  const { rules } = await api("/api/rules");
  state.rules = rules;
  return rules;
}

function thumbHtml(r, cls = "") {
  if (r.mediaId === "any") return `<span class="thumb any ${cls}">${icon("globe", "lg")}</span>`;
  if (r.mediaThumb) return `<img class="thumb ${cls}" src="${esc(r.mediaThumb)}" alt="" referrerpolicy="no-referrer" />`;
  return `<span class="thumb ${cls}">${icon("image")}</span>`;
}

async function viewAutomations() {
  renderShell("automations", `<div class="page">${pageHead("Automations", "Loading…")}<div class="auto-grid">${'<div class="card skeleton" style="height:220px"></div>'.repeat(3)}</div></div>`);
  const rules = await loadRules();
  const head = pageHead(
    "Automations",
    "Each automation listens for keywords in comments and runs a DM flow.",
    rules.length ? `<a class="btn primary" href="#/automations/new">${icon("plus")} New automation</a>` : "",
  );
  if (!rules.length) {
    renderShell("automations", `<div class="page">${head}<div class="card empty">
      <div class="art">${icon("bolt")}</div>
      <h2>Create your first automation</h2>
      <p>Someone comments a keyword like <b>REPO</b> on your reel → they instantly get a DM with your link. You can ask them to follow first.</p>
      <div class="row" style="justify-content:center"><a class="btn primary" href="#/automations/new">${icon("sparkle")} Start from template</a></div>
    </div></div>`);
    return;
  }
  const cards = rules
    .map((r) => {
      const s = r.stats;
      return `<article class="card auto-card">
        <a class="auto-top" href="#/automations/${esc(r.id)}" style="color:inherit;text-decoration:none">
          ${thumbHtml(r)}
          <div class="info">
            <h3>${esc(r.name)}</h3>
            <div class="where">${r.mediaId === "any" ? "Any post or reel" : esc(r.mediaCaption || "Specific post")}</div>
            <div class="kw">${r.keywords.slice(0, 5).map((k) => `<span class="tag mono">${esc(k)}</span>`).join("")}${r.keywords.length > 5 ? `<span class="tag">+${r.keywords.length - 5}</span>` : ""}
              ${r.requireFollow ? `<span class="tag" title="Link only for followers">${icon("userPlus", "sm")} Follow gate</span>` : ""}</div>
          </div>
        </a>
        <div class="auto-stats">
          <div><b>${num(s.matched)}</b><span>Matched</span></div>
          <div><b>${num(s.dms)}</b><span>DMs</span></div>
          <div><b>${num(s.links)}</b><span>Links</span></div>
          <div><b>${pct(s.links, s.matched)}%</b><span>Conv.</span></div>
        </div>
        <div class="auto-foot">
          <label class="switch" title="${r.enabled ? "Turn off" : "Turn on"}"><input type="checkbox" data-action="toggle-rule" data-id="${esc(r.id)}" ${r.enabled ? "checked" : ""} aria-label="Active"/><span></span></label>
          <span class="status-text ${r.enabled ? "on" : "off"}">${r.enabled ? "Active" : "Paused"}</span>
          <span class="spacer"></span>
          <a class="btn sm ghost icon-only" href="#/activity?rule=${esc(r.id)}" title="Activity" aria-label="Activity">${icon("activity", "sm")}</a>
          <a class="btn sm ghost icon-only" href="#/automations/${esc(r.id)}" title="Edit" aria-label="Edit">${icon("edit", "sm")}</a>
          <button class="btn sm ghost icon-only danger" data-action="delete-rule" data-id="${esc(r.id)}" title="Delete" aria-label="Delete">${icon("trash", "sm")}</button>
        </div>
      </article>`;
    })
    .join("");
  renderShell("automations", `<div class="page">${head}<div class="auto-grid">${cards}</div></div>`);
}

/* ======================= modal ======================= */
function openModal({ title, body, footer = "", narrow = false, onMount }) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-back" data-modal-back><div class="modal ${narrow ? "narrow" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h3>${esc(title)}</h3><button class="btn sm ghost icon-only" data-action="close-modal" aria-label="Close">${icon("x")}</button></header>
    <div class="body">${body}</div>${footer ? `<footer>${footer}</footer>` : ""}</div></div>`;
  const back = $("[data-modal-back]", root);
  back.addEventListener("mousedown", (e) => e.target === back && closeModal());
  document.addEventListener("keydown", escClose);
  onMount?.(root);
  ($("input, button.primary", root) ?? $("button", root))?.focus();
}
function closeModal() {
  $("#modal-root").innerHTML = "";
  document.removeEventListener("keydown", escClose);
}
function escClose(e) {
  if (e.key === "Escape") closeModal();
}
function confirmModal(title, message, confirmLabel = "Delete") {
  return new Promise((resolve) => {
    openModal({
      title,
      narrow: true,
      body: `<p style="margin:0;color:var(--text-2)">${message}</p>`,
      footer: `<button class="btn" data-x="no">Cancel</button><button class="btn danger-solid" data-x="yes">${esc(confirmLabel)}</button>`,
      onMount: (root) => {
        $("[data-x=no]", root).onclick = () => (closeModal(), resolve(false));
        $("[data-x=yes]", root).onclick = () => (closeModal(), resolve(true));
        $("[data-action=close-modal]", root).onclick = () => (closeModal(), resolve(false));
      },
    });
  });
}

/* ======================= editor ======================= */
let draft = null;
let errors = {};
let previewTab = "dm";

function counter(field, max) {
  const len = [...(draft[field] || "")].length;
  return `<span class="counter ${len > max ? "over" : ""}" data-counter="${field}" data-max="${max}">${len}/${max}</span>`;
}
const errSlot = (f) => `<div class="err" data-err="${f}">${esc(errors[f] || "")}</div>`;
const fieldCls = (f) => `field ${errors[f] ? "invalid" : ""}`;

function textField(f, label, { max, area = false, placeholder = "", hint = "" } = {}) {
  const control = area
    ? `<textarea class="textarea" id="f-${f}" data-field="${f}" placeholder="${esc(placeholder)}">${esc(draft[f])}</textarea>`
    : `<input class="input" id="f-${f}" data-field="${f}" value="${esc(draft[f])}" placeholder="${esc(placeholder)}" />`;
  return `<div class="${fieldCls(f)}" data-wrap="${f}"><label class="label" for="f-${f}">${label}${max ? counter(f, max) : ""}</label>${control}${hint ? `<div class="hint">${hint}</div>` : ""}${errSlot(f)}</div>`;
}

async function viewEditor(id) {
  renderShell("automations", `<div class="page"><div class="boot" style="min-height:50vh"><div class="spinner"></div></div></div>`);
  const isNew = id === "new";
  let rule;
  if (isNew) rule = clone(TEMPLATE);
  else {
    try {
      rule = (await api(`/api/rules/${encodeURIComponent(id)}`)).rule;
    } catch (e) {
      if (e.status === 404) {
        toast("That automation no longer exists.", "error");
        location.hash = "#/automations";
        return;
      }
      throw e;
    }
  }
  draft = clone(rule);
  draft._publicOn = draft.publicReplies.length > 0;
  if (!draft.publicReplies.length) draft.publicReplies = [""];
  draft._linkBtnOn = Boolean(draft.linkButton);
  if (!draft.linkButton) draft.linkButton = "Open link";
  draft._test = "";
  errors = {};
  state.dirty = false;
  if (!state.account) api("/api/overview?tz=0").then((o) => ((state.account = o.account), renderPreview())).catch(() => {});
  renderEditor(isNew);
}

function renderEditor(isNew) {
  const crumb = `<a class="crumb" href="#/automations">${icon("arrowLeft", "sm")} Automations</a>`;
  const html = `<div class="page">
    ${pageHead(isNew ? "New automation" : draft.name || "Edit automation", "Build the flow on the left. The phone shows what your follower will see.", "", crumb)}
    <div class="editor">
      <div class="steps">
        <section class="step trigger"><span class="step-num">${icon("bolt")}</span>
          <div class="card step-card"><header><div><h3>When someone comments</h3><p>Trigger</p></div></header>
            <div class="field"><label class="label" for="f-name">Automation name</label><input class="input" id="f-name" data-field="name" value="${esc(draft.name)}" maxlength="60" /></div>
            <div class="field"><span class="label">On</span>
              <div class="segmented" role="radiogroup">
                <button type="button" class="${draft.mediaId === "any" ? "on" : ""}" data-action="media-any" role="radio" aria-checked="${draft.mediaId === "any"}">${icon("globe", "sm")} Any post or reel</button>
                <button type="button" class="${draft.mediaId !== "any" ? "on" : ""}" data-action="media-pick" role="radio" aria-checked="${draft.mediaId !== "any"}">${icon("image", "sm")} A specific post</button>
              </div>
              <div id="picked">${pickedHtml()}</div>${errSlot("mediaId")}
            </div>
            <div class="${fieldCls("keywords")}" data-wrap="keywords"><label class="label" for="kw-input">Keywords <span class="counter">Enter to add</span></label>
              <div class="chips" id="chips">${chipsHtml()}<input id="kw-input" placeholder="${draft.keywords.length ? "Add another…" : "e.g. REPO"}" autocomplete="off" /></div>
              ${errSlot("keywords")}
            </div>
            <div class="field"><label class="label" for="f-match">Match</label>
              <select class="select" id="f-match" data-field="match">
                <option value="word" ${draft.match === "word" ? "selected" : ""}>Keyword as a word — “repo please” ✓, “report” ✗ (recommended)</option>
                <option value="contains" ${draft.match === "contains" ? "selected" : ""}>Anywhere in the comment</option>
                <option value="exact" ${draft.match === "exact" ? "selected" : ""}>Whole comment is exactly the keyword</option>
              </select></div>
            <div class="tester">${icon("play", "sm")}<input id="tester" placeholder="Test a comment, e.g. “bro REPO pls”" value="${esc(draft._test)}" aria-label="Test a comment" /><span class="verdict" id="verdict"></span></div>
          </div>
        </section>

        <section class="step"><span class="step-num">${icon("chat")}</span>
          <div class="card step-card ${draft._publicOn ? "" : "off"}" id="card-public"><header><div><h3>Reply publicly</h3><p>Optional · one is picked at random</p></div><span class="spacer"></span>
            <label class="switch"><input type="checkbox" data-action="toggle-public" ${draft._publicOn ? "checked" : ""} aria-label="Reply publicly"/><span></span></label></header>
            <div id="replies">${repliesHtml()}</div>${errSlot("publicReplies")}
          </div>
        </section>

        <section class="step"><span class="step-num">${icon("send")}</span>
          <div class="card step-card"><header><div><h3>Send a DM</h3><p>Meta allows exactly one private reply per comment</p></div></header>
            ${textField("dmText", "Message", { max: 640, area: true, hint: "Tip: say it is an automated message, e.g. “🤖 auto-reply”. Meta recommends telling people they are talking to automation." })}
            ${textField("dmButton", "Button label", { max: 20, placeholder: "Send me the link" })}
          </div>
        </section>

        <section class="step"><span class="step-num">${icon("userPlus")}</span>
          <div class="card step-card ${draft.requireFollow ? "" : "off"}" id="card-follow"><header><div><h3>Ask to follow first</h3><p>Checks Instagram's follow status when they tap</p></div><span class="spacer"></span>
            <label class="switch"><input type="checkbox" data-action="toggle-follow" ${draft.requireFollow ? "checked" : ""} aria-label="Ask to follow first"/><span></span></label></header>
            ${textField("followText", "Message for non-followers", { max: 640, area: true })}
            ${textField("followButton", "Re-check button", { max: 20, placeholder: "I followed ✅" })}
            <div class="callout info small" style="margin-top:14px">${icon("info", "sm")}<div>Instagram only shares follow status after the person has messaged you. If it can't tell, the setting in <a href="#/settings">Settings</a> decides (default: send the link).</div></div>
          </div>
        </section>

        <section class="step"><span class="step-num">${icon("link")}</span>
          <div class="card step-card"><header><div><h3>Deliver the link</h3><p>Final message</p></div></header>
            ${textField("linkText", "Message", { max: 640, area: true, placeholder: "Here you go 🎉" })}
            ${textField("linkUrl", "Link", { placeholder: "https://github.com/you/your-repo" })}
            <div class="field"><label class="row" style="gap:10px;cursor:pointer"><label class="switch"><input type="checkbox" data-action="toggle-linkbtn" ${draft._linkBtnOn ? "checked" : ""} aria-label="Show as button"/><span></span></label><span class="label" style="margin:0">Show the link as a button</span></label></div>
            <div id="linkbtn-wrap" ${draft._linkBtnOn ? "" : "hidden"}>${textField("linkButton", "Button label", { max: 20, placeholder: "Open link" })}</div>
          </div>
        </section>
      </div>

      <aside class="preview-col" aria-label="Preview">
        <div class="preview-tabs"><div class="segmented">
          <button type="button" data-action="tab" data-tab="comment" class="${previewTab === "comment" ? "on" : ""}">${icon("comment", "sm")} Comment</button>
          <button type="button" data-action="tab" data-tab="dm" class="${previewTab === "dm" ? "on" : ""}">${icon("send", "sm")} DM</button>
        </div></div>
        <div class="phone"><div class="screen"><span class="notch"></span><div class="statusbar"><span>9:41</span><span>●●● ▮</span></div><div id="phone-body"></div></div></div>
      </aside>
    </div>
    <div class="save-bar"><div class="inner">
      <label class="switch"><input type="checkbox" data-field-bool="enabled" ${draft.enabled ? "checked" : ""} aria-label="Active"/><span></span></label>
      <span class="status-text" id="status-text">${draft.enabled ? "Active after saving" : "Paused"}</span>
      <span class="spacer"></span>
      <a class="btn ghost" href="#/automations">Cancel</a>
      <button class="btn primary" data-action="save-rule" data-new="${isNew ? 1 : 0}">${icon("check")} ${isNew ? "Create automation" : "Save changes"}</button>
    </div></div>
  </div>`;
  renderShell("automations", html);
  bindEditor();
  renderPreview();
  renderVerdict();
}

function pickedHtml() {
  if (draft.mediaId === "any") return "";
  return `<div class="picked-post">${thumbHtml(draft)}<div class="cap">${esc(draft.mediaCaption || "Selected post")}</div><button type="button" class="btn sm" data-action="media-pick">Change</button></div>`;
}
function chipsHtml() {
  return draft.keywords
    .map((k, i) => `<span class="chip">${esc(k)}<button type="button" data-action="kw-remove" data-i="${i}" aria-label="Remove ${esc(k)}">${icon("x", "sm")}</button></span>`)
    .join("");
}
function repliesHtml() {
  return (
    draft.publicReplies
      .map(
        (r, i) => `<div class="reply-row"><input class="input" data-reply="${i}" value="${esc(r)}" maxlength="300" placeholder="Check your DM 📩" aria-label="Public reply ${i + 1}" />
      ${draft.publicReplies.length > 1 ? `<button type="button" class="btn icon-only ghost" data-action="reply-remove" data-i="${i}" aria-label="Remove">${icon("trash", "sm")}</button>` : ""}</div>`,
      )
      .join("") +
    (draft.publicReplies.length < 5 ? `<button type="button" class="btn sm ghost" data-action="reply-add" style="margin-top:8px">${icon("plus", "sm")} Add a variation</button>` : "")
  );
}

function markDirty() {
  state.dirty = true;
}

function bindEditor() {
  const main = $("#main");
  main.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.field) {
      draft[t.dataset.field] = t.value;
      const c = $(`[data-counter="${t.dataset.field}"]`);
      if (c) {
        const len = [...t.value].length;
        c.textContent = `${len}/${c.dataset.max}`;
        c.classList.toggle("over", len > Number(c.dataset.max));
      }
      clearErr(t.dataset.field);
      markDirty();
      renderPreview();
      if (t.dataset.field === "match") renderVerdict();
    } else if (t.dataset.reply !== undefined) {
      draft.publicReplies[Number(t.dataset.reply)] = t.value;
      markDirty();
      renderPreview();
    } else if (t.id === "tester") {
      draft._test = t.value;
      renderVerdict();
      renderPreview();
    }
  });
  main.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.fieldBool) {
      draft[t.dataset.fieldBool] = t.checked;
      $("#status-text").textContent = t.checked ? "Active after saving" : "Paused";
      markDirty();
    }
  });
  const kw = $("#kw-input");
  const addKw = () => {
    const parts = kw.value.split(",").map((s) => s.trim()).filter(Boolean);
    let added = false;
    for (const p of parts) {
      if (!draft.keywords.some((k) => normalize(k) === normalize(p)) && draft.keywords.length < 20) {
        draft.keywords.push(p.slice(0, 40));
        added = true;
      }
    }
    kw.value = "";
    if (added) {
      refreshChips();
      clearErr("keywords");
      markDirty();
    }
  };
  kw.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKw();
    } else if (e.key === "Backspace" && !kw.value && draft.keywords.length) {
      draft.keywords.pop();
      refreshChips();
      markDirty();
    }
  });
  kw.addEventListener("blur", addKw);
  $("#chips").addEventListener("click", (e) => e.target === e.currentTarget && kw.focus());
}

function refreshChips() {
  const chips = $("#chips");
  $$(".chip", chips).forEach((c) => c.remove());
  chips.insertAdjacentHTML("afterbegin", chipsHtml());
  $("#kw-input").placeholder = draft.keywords.length ? "Add another…" : "e.g. REPO";
  renderVerdict();
  renderPreview();
}
function refreshReplies() {
  $("#replies").innerHTML = repliesHtml();
  renderPreview();
}
function clearErr(f) {
  delete errors[f];
  const slot = $(`[data-err="${f}"]`);
  if (slot) slot.textContent = "";
  $(`[data-wrap="${f}"]`)?.classList.remove("invalid");
}
function renderVerdict() {
  const v = $("#verdict");
  if (!v) return;
  if (!draft._test.trim()) {
    v.textContent = "";
    return;
  }
  const yes = draft.keywords.some((k) => keywordMatches(draft._test, k, draft.match));
  v.className = `verdict ${yes ? "yes" : "no"}`;
  v.textContent = yes ? "✓ Triggers" : "✗ No match";
}

function tpl(text, buttons) {
  return `<div class="msg tpl"><div class="t">${esc(text) || '<span class="placeholder-msg">Message…</span>'}</div>${buttons.map((b) => `<span class="b">${esc(b) || "Button"}</span>`).join("")}</div>`;
}

function renderPreview() {
  const body = $("#phone-body");
  if (!body) return;
  const a = state.account;
  const handle = a?.username || "your_account";
  const sampleComment = draft._test.trim() || (draft.keywords[0] ? `${draft.keywords[0]} please 🙏` : "REPO please 🙏");
  if (previewTab === "comment") {
    const reply = draft._publicOn ? draft.publicReplies.find((r) => r.trim()) : "";
    body.innerHTML = `
      <div class="app-bar">${avatarHtml(a)}<div><b>${esc(handle)}</b><span>${draft.mediaId === "any" ? "Any post" : "Selected post"}</span></div></div>
      <div class="thread" style="padding:0">
        <div class="post"><div class="post-media">${draft.mediaId !== "any" && draft.mediaThumb ? `<img src="${esc(draft.mediaThumb)}" alt="" referrerpolicy="no-referrer"/>` : icon("play", "lg")}</div></div>
        <div class="comments">
          <div class="comment"><span class="avatar">F</span><div><b>follower</b>${esc(sampleComment)}<small>now · Reply</small></div></div>
          ${reply ? `<div class="comment reply">${avatarHtml(a)}<div><b>${esc(handle)}</b>${esc(reply)}<small>now · Author</small></div></div>` : ""}
        </div>
      </div>`;
    return;
  }
  const linkMsg = draft._linkBtnOn && draft.linkUrl
    ? tpl(draft.linkText || "Here you go 👇", [draft.linkButton])
    : `<div class="msg in">${esc([draft.linkText, draft.linkUrl].filter(Boolean).join("\n")) || '<span class="placeholder-msg">Your link…</span>'}</div>`;
  body.innerHTML = `
    <div class="app-bar">${avatarHtml(a)}<div><b>${esc(handle)}</b><span>Business account</span></div></div>
    <div class="thread">
      <div class="sys">Replied to your comment: “${esc(sampleComment.slice(0, 40))}”</div>
      ${tpl(draft.dmText, [draft.dmButton])}
      <div class="msg out">${esc(draft.dmButton) || "Button"}</div>
      ${draft.requireFollow ? `
        <div class="sys">If they don't follow yet</div>
        ${tpl(draft.followText, [draft.followButton])}
        <div class="msg out">${esc(draft.followButton) || "Button"}</div>
        <div class="sys">After they follow</div>` : ""}
      ${linkMsg}
    </div>`;
  const thread = $(".thread", body);
  thread.scrollTop = thread.scrollHeight;
}

async function openMediaPicker() {
  openModal({
    title: "Choose a post or reel",
    body: `<div id="media-body"><div class="media-grid">${'<div class="media-item skeleton"></div>'.repeat(8)}</div></div>`,
  });
  try {
    if (!state.media) state.media = (await api("/api/media")).media;
    const media = state.media;
    const bodyEl = $("#media-body");
    if (!bodyEl) return;
    if (!media.length) {
      bodyEl.innerHTML = `<p class="muted">No posts found on this account.</p>`;
      return;
    }
    bodyEl.innerHTML = `<div class="media-grid">${media
      .map(
        (m) => `<button type="button" class="media-item ${m.id === draft.mediaId ? "on" : ""}" data-action="media-choose" data-id="${esc(m.id)}" title="${esc(m.caption)}">
        ${m.thumb ? `<img src="${esc(m.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"/>` : `<span style="display:grid;place-items:center;height:100%">${icon("image")}</span>`}
        <span class="badge">${m.productType === "REELS" ? "Reel" : m.type === "CAROUSEL_ALBUM" ? "Album" : "Post"}</span>
        <span class="cap">${esc(m.caption || new Date(m.timestamp).toLocaleDateString())}</span></button>`,
      )
      .join("")}</div>`;
  } catch (e) {
    const bodyEl = $("#media-body");
    if (bodyEl) bodyEl.innerHTML = `<div class="callout danger">${icon("alert")}<div><b>Could not load your posts</b><p>${esc(e.message)}</p></div></div>`;
  }
}

async function saveRule(btn) {
  const isNew = btn.dataset.new === "1";
  const payload = { ...draft };
  payload.publicReplies = draft._publicOn ? draft.publicReplies.map((r) => r.trim()).filter(Boolean) : [];
  payload.linkButton = draft._linkBtnOn ? draft.linkButton : "";
  delete payload._publicOn;
  delete payload._linkBtnOn;
  delete payload._test;
  btn.disabled = true;
  try {
    const res = isNew
      ? await api("/api/rules", { method: "POST", body: payload })
      : await api(`/api/rules/${encodeURIComponent(draft.id)}`, { method: "PUT", body: payload });
    state.dirty = false;
    state.rules = null;
    toast(isNew ? "Automation created" : "Changes saved");
    location.hash = "#/automations";
    return res;
  } catch (e) {
    if (e.status === 422 && e.data?.errors) {
      errors = e.data.errors;
      for (const [f, msg] of Object.entries(errors)) {
        const slot = $(`[data-err="${f}"]`);
        if (slot) slot.textContent = msg;
        $(`[data-wrap="${f}"]`)?.classList.add("invalid");
      }
      const first = $(`[data-err]:not(:empty)`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast(e.message, "error");
    } else reportError(e);
  } finally {
    btn.disabled = false;
  }
}

/* ======================= activity ======================= */
const FILTERS = {
  all: { label: "All", match: () => true },
  flow: { label: "Conversations", match: (t) => ["comment_matched", "dm_sent", "button_tap", "link_sent", "follow_requested", "public_reply_sent"].includes(t) },
  links: { label: "Links delivered", match: (t) => t === "link_sent" },
  problems: { label: "Problems", match: (t) => t.endsWith("_failed") || t === "error" },
  skipped: { label: "Skipped / ignored", match: (t) => t.startsWith("skipped") || t === "comment_ignored" },
};

async function viewActivity(params) {
  renderShell("activity", `<div class="page">${pageHead("Activity", "Loading…")}<div class="card skeleton" style="height:320px"></div></div>`);
  const ruleId = params.get("rule");
  const [{ events }, failed] = await Promise.all([
    api(`/api/events?limit=300${ruleId ? `&rule=${encodeURIComponent(ruleId)}` : ""}`),
    api("/api/failed").catch(() => ({ count: 0 })),
    state.rules ? null : loadRules(),
  ]);
  let filter = "all";
  const draw = () => {
    const list = events.filter((e) => FILTERS[filter].match(e.type));
    const rn = ruleId ? ruleName(ruleId) : null;
    renderShell(
      "activity",
      `<div class="page">
      ${pageHead(
        "Activity",
        rn ? `Showing <b>${esc(rn)}</b> · <a href="#/activity">show all</a>` : "Every comment, DM and link, newest first. Kept for 90 days.",
        `${failed.count ? `<button class="btn primary" data-action="retry-failed" title="Sends the DM again to comments from the last 7 days whose DM failed, 10 at a time">${icon("refresh", "sm")} Retry ${failed.count} failed</button>` : ""}<button class="btn" data-action="reload">${icon("refresh", "sm")} Refresh</button>`,
      )}
      <div class="filters" style="margin-bottom:14px">${Object.entries(FILTERS)
        .map(([k, f]) => `<button class="filter ${k === filter ? "on" : ""}" data-filter="${k}">${f.label} <span class="muted">${events.filter((e) => f.match(e.type)).length}</span></button>`)
        .join("")}</div>
      <div class="card">${
        list.length
          ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Event</th><th>Person</th><th>Automation</th><th>Details</th></tr></thead><tbody>
          ${list
            .map((e) => {
              const m = evMeta(e.type);
              return `<tr><td class="muted small" title="${esc(fullTime(e.ts))}" style="white-space:nowrap">${timeAgo(e.ts)}</td>
              <td><span class="ev tone-${m.tone}">${icon(m.icon, "sm")} ${esc(m.label)}</span></td>
              <td>${e.username ? `<a href="https://www.instagram.com/${encodeURIComponent(e.username)}/" target="_blank" rel="noopener noreferrer">@${esc(e.username)}</a>` : '<span class="muted">—</span>'}</td>
              <td>${esc(ruleName(e.ruleId) ?? (e.ruleId ? "Deleted automation" : "—"))}</td>
              <td><div class="detail" title="${esc(e.detail)}">${esc(e.detail ?? "")}</div></td></tr>`;
            })
            .join("")}</tbody></table></div>`
          : `<div class="empty"><div class="art">${icon("activity")}</div><h2>No activity yet</h2><p>Once someone comments one of your keywords, every step shows up here.</p></div>`
      }</div></div>`,
    );
    $$("[data-filter]").forEach((b) => (b.onclick = () => ((filter = b.dataset.filter), draw())));
  };
  draw();
}

/* ======================= settings ======================= */
async function viewSettings() {
  renderShell("settings", `<div class="page">${pageHead("Settings", "Loading…")}<div class="card skeleton" style="height:320px"></div></div>`);
  const { settings, token } = await api("/api/settings");
  renderShell(
    "settings",
    `<div class="page" style="max-width:820px">
    ${pageHead("Settings", "Applies to every automation.")}
    <form class="stack" id="settings-form">
      <div class="card card-pad">
        <h3 style="font-size:15px">Don't message the same person twice</h3>
        <p class="muted small" style="margin:4px 0 14px">If someone comments the keyword again, skip them for this many days. 0 = always reply.</p>
        <div class="field" data-wrap="cooldownDays" style="max-width:220px"><div class="input-group"><input class="input" type="number" min="0" max="365" name="cooldownDays" value="${esc(settings.cooldownDays)}" aria-label="Cooldown days"/><span class="tag" style="align-self:center">days</span></div>${'<div class="err" data-err="cooldownDays"></div>'}</div>
      </div>
      <div class="card card-pad">
        <h3 style="font-size:15px">When Instagram can't tell if they follow you</h3>
        <p class="muted small" style="margin:4px 0 14px">Instagram only shares follow status after the person has messaged you, so the check can fail.</p>
        <label class="radio-card"><input type="radio" name="onFollowCheckError" value="send_link" ${settings.onFollowCheckError === "send_link" ? "checked" : ""}/><div><b>Send the link anyway</b><span class="muted small">Recommended. Nobody gets stuck because of an API error.</span></div></label>
        <label class="radio-card"><input type="radio" name="onFollowCheckError" value="ask_follow" ${settings.onFollowCheckError === "ask_follow" ? "checked" : ""}/><div><b>Ask them to follow</b><span class="muted small">Stricter, but some followers may be asked even though they already follow.</span></div></label>
      </div>
      <div class="card card-pad">
        <h3 style="font-size:15px">Plain-text fallback</h3>
        <p class="muted small" style="margin:4px 0 14px">If Instagram refuses the button in the first DM, the message is sent as text with this line added. Their reply then counts as the button tap.</p>
        <input class="input" name="fallbackHint" value="${esc(settings.fallbackHint)}" maxlength="200" aria-label="Fallback line"/>
      </div>
      <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">${icon("check")} Save settings</button></div>
    </form>
    <div class="card card-pad" style="margin-top:16px">
      <div class="row wrap"><span class="kpi-icon tone-green" style="width:36px;height:36px;border-radius:11px;display:grid;place-items:center">${icon("shield")}</span>
        <div style="flex:1;min-width:200px"><h3 style="font-size:15px">Instagram access token</h3>
          <p class="muted small" style="margin:2px 0 0">${
            token.source === "missing" ? "Not set. Add the IG_ACCESS_TOKEN secret."
            : token.mode === "unified" ? "Unified login token from your IG_ACCESS_TOKEN secret. It doesn't expire, so there is nothing to refresh."
            : token.source === "refreshed" ? `Auto-refreshed ${timeAgo(token.refreshedAt)}. Tokens last 60 days; this app refreshes them weekly.`
            : "Using the token from your IG_ACCESS_TOKEN secret. It is refreshed automatically once it is at least a day old."
          }</p></div>
        ${token.mode === "unified" ? "" : `<button class="btn" data-action="refresh-token">${icon("refresh", "sm")} Refresh now</button>`}</div>
    </div>
    <div class="card card-pad mobile-only" style="margin-top:16px;justify-content:space-between;align-items:center">
      <button class="btn" data-action="theme">${icon(currentTheme() === "dark" ? "sun" : "moon")}</button>
      <button class="btn" data-action="logout">${icon("logout", "sm")} Sign out</button>
    </div>
  </div>`,
  );
  $("#settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api("/api/settings", {
        method: "PUT",
        body: { cooldownDays: Number(fd.get("cooldownDays")), onFollowCheckError: fd.get("onFollowCheckError"), fallbackHint: fd.get("fallbackHint") },
      });
      toast("Settings saved");
    } catch (err) {
      if (err.data?.errors?.cooldownDays) $('[data-err="cooldownDays"]').textContent = err.data.errors.cooldownDays;
      reportError(err);
    }
  });
}

/* ======================= setup wizard ======================= */
let wzActive = null;

const ext = (href, label) => `<a class="btn sm" href="${href}" target="_blank" rel="noopener noreferrer">${esc(label)} ${icon("external", "sm")}</a>`;
const kbd = (t) => `<span class="kbd">${esc(t)}</span>`;
const copyBox = (text, id = "") =>
  `<div class="copy-box"><code ${id ? `id="${id}"` : ""}>${esc(text)}</code><button class="btn sm" data-action="copy" data-text="${esc(text)}">${icon("copy", "sm")} Copy</button></div>`;
const copyArea = (text) =>
  `<div class="copy-area"><pre>${esc(text)}</pre><button class="btn sm" data-action="copy" data-text="${esc(text)}">${icon("copy", "sm")} Copy</button></div>`;

function wizardContent(id, ov) {
  const s = ov.setup;
  const user = ov.account?.username;
  const firstRule = state.rules?.find((r) => r.enabled) ?? state.rules?.[0];
  const kw = firstRule?.keywords?.[0] ?? "REPO";
  switch (id) {
    case "app":
      return {
        kicker: "Step 1 · about 5 minutes",
        title: "Create your Meta app",
        lead: "A Meta app is the free “key” that lets AutoDM reply on Instagram for you. Only you use it.",
        body: `
          <div class="callout" style="margin-bottom:20px">${icon("info")}<div><b>Before you start</b><p>Your Instagram must be a <b>Professional</b> account (Business or Creator) and <b>public</b>. In the Instagram app, look for “Switch to professional account” in settings.</p></div></div>
          <ol class="wz-list">
            <li><b>Open Meta for Developers</b><p>Log in with Facebook. If asked, finish the short developer sign-up.</p><div style="margin-top:8px">${ext("https://developers.facebook.com/apps", "Open Meta for Developers")}</div></li>
            <li><b>Create the app</b><p>Click ${kbd("Create app")} → use case ${kbd("Other")} → ${kbd("Next")} → type ${kbd("Business")} → ${kbd("Next")}. Name it anything, for example <i>AutoDM</i>, add your email and create it.</p></li>
            <li><b>Add Instagram</b><p>On the app's page find <b>Instagram</b> and click ${kbd("Set up")}. In the left menu, under <b>Instagram</b>, open <b>API setup with Unified login</b> — keep this tab open for the next step.</p></li>
          </ol>
          <p class="hint">Don't see “Unified login”? Meta shows it only when the app belongs to a business portfolio (App settings → Basic). If your app shows <b>API setup with Instagram login</b> instead, that works too — follow the README's “Instagram login” notes.</p>`,
      };
    case "connect":
      return {
        kicker: "Step 2 · about 10 minutes",
        title: "Connect your Instagram",
        lead: "Give AutoDM permission to read comments and send DMs on your account. Do these in order on Meta's “API setup with Unified login” page.",
        body: `
          <ol class="wz-list">
            <li><b>Create a configuration</b><p>Under <b>1. Configure your app</b>, click ${kbd("Create new configuration")}. If asked, click ${kbd("Use this configuration")}.</p></li>
            <li><b>Save a redirect URL</b><p>Meta needs one even though AutoDM doesn't use it. Copy this, paste it in <b>Register a new redirect URL</b> and click ${kbd("Save")}.</p>${copyBox(s.redirectUrl)}</li>
            <li><b>Add your Instagram as a tester</b><p>Under <b>Generate access tokens</b>, click ${kbd("Add account")} and enter your Instagram username. Meta sends a tester invite.</p></li>
            <li><b>Accept the invite</b><p>On a computer open <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">instagram.com</a> → <b>Settings</b> → <b>Website permissions</b> → <b>Apps and websites</b> → <b>Tester invites</b> → ${kbd("Accept")}.</p></li>
            <li><b>Generate the token</b><p>Back in Meta, refresh the page. Next to your account click ${kbd("Generate token")}, log in and allow everything. <b>Copy the token right away</b> — Meta shows it only once. Paste it in Notepad.</p></li>
            <li><b>Copy the app secret</b><p>Left menu ${kbd("App settings")} → ${kbd("Basic")} → <b>App secret</b> → ${kbd("Show")} → copy. (Use this one, not an “Instagram app secret”.)</p></li>
            <li><b>Paste both into Cloudflare</b><p>Cloudflare → <b>Workers &amp; Pages</b> → your worker → <b>Settings</b> → <b>Variables and Secrets</b>. Edit <code>IG_ACCESS_TOKEN</code> → paste the token. Edit <code>META_APP_SECRET</code> → paste the app secret. Click ${kbd("Deploy")}. Both must be type <b>Secret</b>.</p><div style="margin-top:8px">${ext("https://dash.cloudflare.com/?to=/:account/workers-and-pages", "Open Cloudflare")}</div></li>
          </ol>
          ${s.tokenWorks
            ? `<div class="status-line ok">${icon("check")} Connected as @${esc(user)}</div>`
            : `<div class="status-line bad">${icon("alert")} ${esc(ov.accountError || "Not connected yet")}</div>`}
          ${s.tokenWorks && !s.secrets.appSecret ? `<div class="status-line bad">${icon("alert")} META_APP_SECRET is not set yet</div>` : ""}`,
      };
    case "webhook":
      return {
        kicker: "Step 3 · about 2 minutes",
        title: "Connect the webhook",
        lead: "This tells Instagram to notify AutoDM the moment someone comments.",
        body: `
          <ol class="wz-list">
            <li><b>Open “Configure webhooks” in Meta</b><p>Same page as step 2 (<b>API setup with ${s.apiMode === "instagram" ? "Instagram" : "Unified"} login</b>), find the webhooks section.</p></li>
            <li><b>Paste these two values</b>
              <div class="label" style="margin-top:10px">Callback URL</div>${copyBox(s.webhookUrl)}
              <div class="label" style="margin-top:12px">Verify token</div>
              <div class="copy-box"><code id="vt">••••••••••••••</code><button class="btn sm" data-action="reveal-vt">${icon("eye", "sm")} Show</button><button class="btn sm" data-action="copy-vt">${icon("copy", "sm")} Copy</button></div>
              <p style="margin-top:10px">Click ${kbd("Verify and save")}.</p></li>
            <li><b>Turn on three fields</b><p>Subscribe to <code>comments</code>, <code>messages</code> and <code>messaging_postbacks</code>.</p></li>
            <li><b>Switch on notifications for your account</b><p>One click here:</p><div style="margin-top:8px"><button class="btn primary sm" data-action="subscribe">${icon("bolt", "sm")} Subscribe my account</button></div></li>
          </ol>
          ${s.lastWebhookAt
            ? `<div class="status-line ok">${icon("check")} Receiving events · last one ${timeAgo(s.lastWebhookAt)}</div>`
            : s.lastWebhookAttemptAt
              ? `<div class="status-line bad">${icon("alert")} Meta is sending events (${timeAgo(s.lastWebhookAttemptAt)}) but AutoDM rejects them: <code>META_APP_SECRET</code> doesn't match. Use the App secret from Meta → App settings → Basic.</div>`
              : `<div class="status-line">${icon("clock")} Waiting for the first event. Tip: press ${kbd("Test")} next to <code>comments</code> in Meta, then “Check again”.</div>`}`,
      };
    case "automation":
      return {
        kicker: "Step 4 · 1 minute",
        title: "Create your first automation",
        lead: "Choose the keyword, write the DM, add your link. A ready-made template is filled in for you.",
        body: `
          <a class="btn primary lg" href="#/automations/new">${icon("plus")} Create from template</a>
          ${s.activeRules
            ? `<div class="status-line ok" style="margin-top:18px">${icon("check")} ${s.activeRules} automation${s.activeRules > 1 ? "s" : ""} active</div>`
            : ""}`,
      };
    case "test":
      return {
        kicker: "Step 5 · about 5 minutes",
        title: "Test with a second account",
        lead: "Until Meta approves your app, only Instagram accounts you add as testers get DMs. Use a friend's or a second account.",
        body: `
          <ol class="wz-list">
            <li><b>Add a tester</b><p>In your Meta app: ${kbd("App roles")} → ${kbd("Roles")} → add the second Instagram account as <b>Instagram Tester</b>.</p></li>
            <li><b>Accept the invite</b><p>On the second account, accept the tester invite (usually in Instagram settings under apps and websites, or from the email Meta sends).</p></li>
            <li><b>Comment the keyword</b><p>From the second account, comment <code>${esc(kw)}</code> on any of ${user ? `@${esc(user)}'s` : "your"} posts. Within seconds you should see the public reply and the DM.</p></li>
          </ol>
          ${(ov.totals.dm_sent || 0) > 0
            ? `<div class="status-line ok">${icon("check")} It works — ${num(ov.totals.dm_sent)} DM${ov.totals.dm_sent > 1 ? "s" : ""} sent in the last 14 days</div>`
            : `<div class="status-line">${icon("clock")} No DM sent yet. Watch <a href="#/activity">Activity</a> while you test.</div>`}`,
      };
    case "approve":
      return {
        kicker: "Step 6 · about 1 week (Meta's review)",
        title: "Get approved by Meta",
        lead: "This is what lets AutoDM reply to all your followers, not just testers. We prepared every text, link and file Meta asks for.",
        body: `<a class="btn primary lg" href="#/approval">${icon("shield")} Open the approval kit</a>`,
      };
  }
}

async function viewSetup() {
  renderShell("setup", `<div class="page">${pageHead("Setup", "Loading…")}<div class="card skeleton" style="height:460px"></div></div>`);
  const [ov] = await Promise.all([loadOverview(), state.rules ? null : loadRules().catch(() => null)]);
  const steps = setupSteps(ov);
  const doneCount = steps.filter((s) => s.done).length;
  if (!wzActive || !steps.some((s) => s.id === wzActive)) wzActive = (steps.find((s) => !s.done) ?? steps[0]).id;
  const idx = steps.findIndex((s) => s.id === wzActive);
  const c = wizardContent(wzActive, ov);
  const prev = steps[idx - 1];
  const next = steps[idx + 1];

  renderShell(
    "setup",
    `<div class="page">
    ${pageHead("Setup", "Six short steps. AutoDM checks each one for you.")}
    <div class="wizard">
      <aside class="wz-side">
        <div class="wz-progress"><div class="row"><span>${doneCount} of ${steps.length} done</span><span>${pct(doneCount, steps.length)}%</span></div>
          <div class="progress"><div style="width:${pct(doneCount, steps.length)}%"></div></div></div>
        <ol class="wz-steps">${steps
          .map(
            (s, i) => `<li><button class="wz-step ${s.done ? "done" : ""} ${s.id === wzActive ? "active" : ""}" data-action="wz-go" data-step="${s.id}" ${s.id === wzActive ? 'aria-current="step"' : ""}>
            <span class="check-badge">${s.done ? icon("check", "sm") : i + 1}</span>${esc(s.title)}</button></li>`,
          )
          .join("")}</ol>
      </aside>
      <section class="card wz-panel" aria-live="polite">
        <div class="wz-kicker">${esc(c.kicker)}</div>
        <h2>${esc(c.title)}</h2>
        <p class="lead">${esc(c.lead)}</p>
        ${c.body}
        <div class="wz-foot">
          ${prev ? `<button class="btn ghost" data-action="wz-go" data-step="${prev.id}">${icon("arrowLeft", "sm")} Back</button>` : ""}
          <span class="spacer"></span>
          <button class="btn" data-action="wz-check">${icon("refresh", "sm")} Check again</button>
          ${next ? `<button class="btn primary" data-action="wz-go" data-step="${next.id}">Next step</button>` : ""}
        </div>
      </section>
    </div></div>`,
  );
}

/* ======================= approval kit ======================= */
const KIT_KEYS = ["calls", "settings", "verification", "instructions", "permissions", "recording", "submit", "live"];
const openKit = new Set();

function permNames(ov) {
  return ov.setup.apiMode === "instagram"
    ? { basic: "instagram_business_basic", comments: "instagram_business_manage_comments", messages: "instagram_business_manage_messages" }
    : { basic: "instagram_basic", comments: "instagram_manage_comments", messages: "instagram_manage_messages" };
}

function kitTexts(ov) {
  const P = permNames(ov);
  const user = ov.account?.username ? `@${ov.account.username}` : "@your_account";
  const r = state.rules?.find((x) => x.enabled) ?? state.rules?.[0] ?? TEMPLATE;
  const kw = r.keywords[0] ?? "REPO";
  const where = r.mediaId === "any" ? `any post or reel on ${user}` : `this post on ${user}: ${r.mediaCaption || "(the selected post)"}`;
  const follow = r.requireFollow
    ? `\n4. Tap "${r.dmButton}". If your test account does not follow ${user}, you receive a message asking you to follow, with the button "${r.followButton}". Follow ${user} and tap "${r.followButton}".\n5. You receive the final message with the link.`
    : `\n4. Tap "${r.dmButton}". You receive the final message with the link.`;

  const instructions = `AutoDM is used only by the owner of the Instagram professional account ${user} to reply to people who comment a keyword on the account's posts. It does not offer login to other businesses.

How to test (no login needed):
1. With any Instagram account, open ${where}.
2. Comment the word "${kw}".
3. Within a few seconds you get a public reply under your comment and a direct message from ${user} with a button "${r.dmButton}".${follow}

Your test account must be added as an Instagram Tester while the app is in development, or the app must be approved for Advanced Access.

The owner manages automations in a private dashboard at ${location.origin} (password protected). Dashboard password for reviewers, if needed: [ADD A TEMPORARY PASSWORD OR REMOVE THIS LINE]`;

  const perms = {
    [P.basic]: `AutoDM uses ${P.basic} to read the connected professional account's ID, username and profile picture, which are shown in the owner's dashboard, and to list the account's own posts and reels so the owner can choose which post an automation applies to. AutoDM only accesses the single account owned by the app owner.`,
    [P.comments]: `AutoDM uses ${P.comments} to receive webhook notifications when someone comments on the owner's posts or reels, to check whether the comment contains a keyword the owner configured (for example "${kw}"), and to post one short public reply under that comment (for example "${r.publicReplies?.[0] || "Check your DM"}"). AutoDM does not hide, delete or moderate comments and does not read comments for any other purpose.`,
    [P.messages]: `AutoDM uses ${P.messages} to send one private reply to a person who commented the configured keyword, to receive the postback when that person taps the button in the message, to check whether they follow the account (is_user_follow_business) when the owner requires it, and to send them the link they asked for. Messages are only sent to people who commented the keyword or tapped a button, within Meta's messaging windows. AutoDM never sends bulk, promotional or unsolicited messages.`,
  };

  const recording = `Screen recording plan (about 2 minutes, English UI, add captions):

1. Open the AutoDM dashboard at ${location.origin}. Show the connected account ${user} (${P.basic}) and the post picker in an automation.
2. Show the automation: keyword "${kw}", public reply, DM text and button.
3. On a second phone/account, open ${where} and comment "${kw}".
4. Show the public reply appearing under the comment (${P.comments}).
5. Open the DMs on the second account and show the message with the "${r.dmButton}" button (${P.messages}).
6. Tap the button${r.requireFollow ? `, show the follow request, follow ${user}, tap "${r.followButton}"` : ""} and show the link arriving.
7. Back in the dashboard, open Activity and show each step logged.

Captions to add: "Comment with keyword", "Automatic public reply", "Private reply with button", "Follow check", "Link delivered".`;

  return { instructions, perms, recording, user };
}

function kitItem(key, n, title, desc, body, rp) {
  const done = Boolean(rp[key]);
  return `<section class="card kit-item ${done ? "done" : ""} ${openKit.has(key) ? "open" : ""}" data-kit="${key}">
    <header>
      <span class="num">${done ? icon("check", "sm") : n}</span>
      <div style="flex:1;min-width:0"><h3><button class="btn ghost" data-action="kit-open" data-key="${key}" style="height:auto;padding:0;color:inherit;font:inherit;font-weight:650">${esc(title)}</button></h3><p>${desc}</p></div>
      <label class="done-toggle"><input type="checkbox" class="check" data-kit-done="${key}" ${done ? "checked" : ""}/> Done</label>
    </header>
    <div class="kit-body">${body}</div>
  </section>`;
}

async function viewApproval() {
  renderShell("approval", `<div class="page">${pageHead("Get approved", "Loading…")}<div class="card skeleton" style="height:460px"></div></div>`);
  const [ov, { settings }] = await Promise.all([loadOverview(), api("/api/settings"), state.rules ? null : loadRules().catch(() => null)]);
  const rp = state.reviewProgress ?? {};
  const t = kitTexts(ov);
  const P = permNames(ov);
  const privacyUrl = `${location.origin}/privacy`;
  const doneCount = KIT_KEYS.filter((k) => rp[k]).length;
  const tick = (ok, label) => `<div class="row small" style="margin-top:6px">${ok ? icon("check", "sm") : icon("clock", "sm")}<span class="${ok ? "" : "muted"}">${label}</span></div>`;

  const items = [
    kitItem("calls", 1, "Use each permission once",
      "Meta only lets you request a permission after it has been used successfully in the last 30 days.",
      `<p>Doing the tester test in Setup covers all three. Meta says calls can take up to 2 days to show in the dashboard.</p>
       ${tick(ov.setup.tokenWorks, `<code>${P.basic}</code> — account loaded`)}
       ${tick((ov.totals.public_reply_sent || 0) > 0, `<code>${P.comments}</code> — public reply sent`)}
       ${tick((ov.totals.dm_sent || 0) > 0, `<code>${P.messages}</code> — DM sent`)}`, rp),
    kitItem("settings", 2, "Fill in your app settings",
      "In Meta: App settings → Basic. App Review asks for these four things.",
      `<h4>Privacy policy URL</h4><p class="muted small">AutoDM hosts one for you. It uses the details below.</p>${copyBox(privacyUrl)}
       <div class="row" style="margin-top:8px"><a class="btn sm" href="/privacy" target="_blank" rel="noopener">${icon("eye", "sm")} Preview</a><span class="muted small">If Meta asks for data deletion instructions, use <code>${esc(privacyUrl)}#delete</code></span></div>
       <form id="profile-form" class="grid" style="grid-template-columns:1fr 1fr;margin-top:14px;align-items:end">
         <div class="field"><label class="label" for="pf-name">Your name or brand</label><input class="input" id="pf-name" name="ownerName" value="${esc(settings.ownerName)}" maxlength="100" placeholder="${esc(t.user)}"/></div>
         <div class="field" data-wrap="contactEmail"><label class="label" for="pf-email">Contact email</label><input class="input" id="pf-email" name="contactEmail" type="email" value="${esc(settings.contactEmail)}" maxlength="200" placeholder="you@example.com"/></div>
         <div><button class="btn sm" type="submit">${icon("check", "sm")} Save</button> <span class="err" data-err="contactEmail"></span></div>
       </form>
       <h4>App icon (1024 × 1024)</h4><p class="muted small">A clean black and white icon, ready to upload.</p>
       <button class="btn sm" data-action="download-icon" style="margin-top:6px">${icon("image", "sm")} Download app icon</button>
       <h4>App category</h4><p class="muted small">Pick the category closest to what you do.</p>
       <h4>Business email</h4><p class="muted small">Use the same contact email. Meta sends review results there.</p>`, rp),
    kitItem("verification", 3, "Verify your business",
      "Meta requires Business Verification for apps that serve people without a role on the app.",
      `<ol class="wz-list">
         <li><b>Start</b><p>Meta app → ${kbd("App settings")} → ${kbd("Basic")} → <b>Verification</b> → ${kbd("Start Verification")}.</p></li>
         <li><b>Check the document list first</b><p>Meta's Business Help Center lists the accepted documents. Read it before you start — it decides how long this step takes, especially for individual creators.</p><div style="margin-top:8px">${ext("https://www.facebook.com/business/help/1095661473946872", "About Business Verification")}</div></li>
         <li><b>Wait for the result</b><p>You can prepare the other items while Meta checks.</p></li>
       </ol>`, rp),
    kitItem("instructions", 4, "Reviewer instructions",
      "Meta reviewers follow these steps to test your app. Paste into “Provide verification details”.",
      `${copyArea(t.instructions)}<p class="hint" style="margin-top:8px">Edit the last line: add a temporary dashboard password for reviewers, or delete it.</p>`, rp),
    kitItem("permissions", 5, "Explain each permission",
      "For each permission, Meta asks “How will your app use…”. Paste the matching text.",
      Object.entries(t.perms).map(([p, txt]) => `<h4><code>${p}</code></h4>${copyArea(txt)}`).join(""), rp),
    kitItem("recording", 6, "Record your screen",
      "One short video showing the whole flow. Meta asks for English UI or captions, and clear explanations of buttons.",
      copyArea(t.recording), rp),
    kitItem("submit", 7, "Submit for review",
      "Meta's guide says a decision usually comes within a week.",
      `<ol class="wz-list">
         <li><b>Open App Review</b><p>${ov.setup.apiMode === "instagram"
           ? `${kbd("Instagram")} → ${kbd("API setup with Instagram login")} → click the arrow on <b>Complete app review</b> → ${kbd("Continue to app review")} → ${kbd("Edit")}.`
           : `In the left menu open ${kbd("App Review")} and find the permission requests (Meta labels this “Permissions and features” or “Requests”).`}</p></li>
         <li><b>Request Advanced Access — only these three</b><p><code>${P.basic}</code>, <code>${P.comments}</code> and <code>${P.messages}</code>. Paste the texts from items 4–5 and upload the recording. Don't request permissions AutoDM doesn't use (like ads or publishing) — Meta rejects requests for unused permissions.</p></li>
         <li><b>Submit</b><p>Click ${kbd("Submit for Review")} and accept the terms. If it's rejected, Meta tells you why — fix it and submit again.</p></li>
       </ol>`, rp),
    kitItem("live", 8, "Switch to Live",
      "After approval, publish the app so everyone gets your DMs.",
      `<p>In the Meta app dashboard, switch the app mode from <b>Development</b> to <b>Live</b>. Then comment from an account that is not a tester to confirm. Tick “Done” here when it works.</p>`, rp),
  ].join("");

  renderShell(
    "approval",
    `<div class="page" style="max-width:900px">
    ${pageHead("Get approved by Meta", "Right now only testers get DMs. Follow these 8 items to reply to everyone. Every text, link and file Meta asks for is ready here.")}
    <div class="timeline" style="margin-bottom:16px">
      <div><span class="when">Today · ~1 hour</span><b>Prepare</b><span>Items 1–6 on this page</span></div>
      <div><span class="when">Meta</span><b>Business Verification</b><span>Meta checks your documents</span></div>
      <div><span class="when">Usually ≤ 1 week</span><b>App Review</b><span>Meta tests your app</span></div>
      <div><span class="when">Then</span><b>Go Live</b><span>Everyone gets DMs</span></div>
    </div>
    <div class="wz-progress card card-pad" style="margin-bottom:16px"><div class="row"><span>${doneCount} of ${KIT_KEYS.length} done</span><span>${pct(doneCount, KIT_KEYS.length)}%</span></div><div class="progress"><div style="width:${pct(doneCount, KIT_KEYS.length)}%"></div></div></div>
    <div class="kit">${items}</div>
    <p class="hint" style="margin-top:16px">These texts are a starting point. Make sure they match exactly what you show in the recording. Sources: <a href="https://developers.facebook.com/documentation/instagram-platform/app-review" target="_blank" rel="noopener noreferrer">Meta's App Review guide</a>.</p>
  </div>`,
  );

  $$("[data-kit-done]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      const progress = { ...(state.reviewProgress ?? {}), [cb.dataset.kitDone]: cb.checked };
      try {
        state.reviewProgress = (await api("/api/review-progress", { method: "PUT", body: { progress } })).progress;
        openKit.delete(cb.dataset.kitDone);
        viewApproval();
      } catch (e) {
        cb.checked = !cb.checked;
        reportError(e);
      }
    }),
  );
  $("#profile-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api("/api/settings", { method: "PUT", body: { ownerName: fd.get("ownerName"), contactEmail: fd.get("contactEmail") } });
      $('[data-err="contactEmail"]').textContent = "";
      toast("Saved. Your privacy page is updated.");
    } catch (err) {
      if (err.data?.errors?.contactEmail) $('[data-err="contactEmail"]').textContent = err.data.errors.contactEmail;
      reportError(err);
    }
  });
}

/** Draws the brand mark on a 1024px canvas and downloads it as PNG (for Meta's app icon). */
function downloadIcon() {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d");
  g.fillStyle = "#0a0a0a";
  g.fillRect(0, 0, 1024, 1024);
  g.scale(32, 32);
  g.fillStyle = "#ffffff";
  g.fill(new Path2D(BUBBLE_PATH));
  g.fillStyle = "#0a0a0a";
  g.fill(new Path2D(BOLT_PATH));
  c.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "autodm-app-icon-1024.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "image/png");
}

/* ======================= global actions ======================= */
const actions = {
  theme: () => toggleTheme(),
  logout: async () => {
    await api("/api/logout", { method: "POST", body: {} }).catch(() => {});
    state.account = null;
    state.rules = null;
    renderLogin();
  },
  "close-modal": () => closeModal(),
  "wz-go": (el) => {
    wzActive = el.dataset.step;
    viewSetup();
  },
  "wz-check": async (el) => {
    el.disabled = true;
    await viewSetup();
    toast("Status updated");
  },
  "kit-open": (el) => {
    const k = el.dataset.key;
    openKit.has(k) ? openKit.delete(k) : openKit.add(k);
    $(`[data-kit="${k}"]`)?.classList.toggle("open", openKit.has(k));
  },
  "download-icon": () => downloadIcon(),
  copy: (el) => copyText(el.dataset.text),
  reload: () => route(),
  "reveal-vt": async (el) => {
    const { verifyToken } = await api("/api/setup/verify-token");
    $("#vt").textContent = verifyToken || "(not set)";
    el.remove();
  },
  "copy-vt": async () => copyText((await api("/api/setup/verify-token")).verifyToken),
  subscribe: async (el) => {
    el.disabled = true;
    try {
      await api("/api/setup/subscribe", { method: "POST", body: {} });
      toast("Subscribed. New comments will now reach AutoDM.");
    } catch (e) {
      reportError(e);
    } finally {
      el.disabled = false;
    }
  },
  "retry-failed": async (el) => {
    el.disabled = true;
    el.innerHTML = '<span class="spinner"></span> Sending…';
    try {
      const r = await api("/api/failed/retry", { method: "POST", body: {} });
      const parts = [`${r.sent} sent`];
      if (r.failed) parts.push(`${r.failed} failed again`);
      if (r.skipped) parts.push(`${r.skipped} skipped`);
      let msg = `Retry: ${parts.join(", ")}.`;
      if (r.stoppedForRateLimit) msg += " Instagram's limit was reached, try again in an hour.";
      else if (r.remaining) msg += ` ${r.remaining} left, press again in a minute.`;
      toast(msg, r.sent || !r.failed ? "ok" : "error");
    } catch (e) {
      reportError(e);
    }
    route();
  },
  "refresh-token": async (el) => {
    el.disabled = true;
    try {
      const r = await api("/api/token/refresh", { method: "POST", body: {} });
      toast(r.refreshed ? "Token refreshed for another 60 days" : r.reason, r.refreshed ? "ok" : "error");
      if (r.refreshed) viewSettings();
    } catch (e) {
      reportError(e);
    } finally {
      el.disabled = false;
    }
  },
  "toggle-rule": async (el) => {
    const enabled = el.checked;
    try {
      await api(`/api/rules/${encodeURIComponent(el.dataset.id)}/enabled`, { method: "POST", body: { enabled } });
      const r = state.rules?.find((x) => x.id === el.dataset.id);
      if (r) r.enabled = enabled;
      const foot = el.closest(".auto-foot");
      const st = $(".status-text", foot);
      st.textContent = enabled ? "Active" : "Paused";
      st.className = `status-text ${enabled ? "on" : "off"}`;
      const count = $(".nav-item.active .count");
      if (count && state.rules) count.textContent = state.rules.filter((x) => x.enabled).length;
      toast(enabled ? "Automation turned on" : "Automation paused");
    } catch (e) {
      el.checked = !enabled;
      reportError(e);
    }
  },
  "delete-rule": async (el) => {
    const r = state.rules?.find((x) => x.id === el.dataset.id);
    const ok = await confirmModal("Delete automation?", `<b>${esc(r?.name ?? "This automation")}</b> will stop replying. People already in the flow will no longer get the link. This cannot be undone.`);
    if (!ok) return;
    try {
      await api(`/api/rules/${encodeURIComponent(el.dataset.id)}`, { method: "DELETE" });
      toast("Automation deleted");
      viewAutomations();
    } catch (e) {
      reportError(e);
    }
  },
  // editor
  tab: (el) => {
    previewTab = el.dataset.tab;
    $$("[data-action=tab]").forEach((b) => b.classList.toggle("on", b === el));
    renderPreview();
  },
  "media-any": () => {
    draft.mediaId = "any";
    draft.mediaCaption = "";
    draft.mediaThumb = "";
    $("#picked").innerHTML = "";
    $$('[data-action="media-any"],[data-action="media-pick"]').forEach((b) => b.closest(".segmented") && b.classList.toggle("on", b.dataset.action === "media-any"));
    clearErr("mediaId");
    markDirty();
    renderPreview();
  },
  "media-pick": () => openMediaPicker(),
  "media-choose": (el) => {
    const m = state.media.find((x) => x.id === el.dataset.id);
    draft.mediaId = m.id;
    draft.mediaCaption = (m.caption || "").slice(0, 200);
    draft.mediaThumb = m.thumb || "";
    closeModal();
    $("#picked").innerHTML = pickedHtml();
    $$(".segmented [data-action]").forEach((b) => {
      if (b.dataset.action === "media-any" || b.dataset.action === "media-pick") b.classList.toggle("on", b.dataset.action === "media-pick");
    });
    clearErr("mediaId");
    markDirty();
    renderPreview();
  },
  "kw-remove": (el) => {
    draft.keywords.splice(Number(el.dataset.i), 1);
    refreshChips();
    markDirty();
  },
  "reply-add": () => {
    draft.publicReplies.push("");
    refreshReplies();
    $$("[data-reply]").pop()?.focus();
    markDirty();
  },
  "reply-remove": (el) => {
    draft.publicReplies.splice(Number(el.dataset.i), 1);
    refreshReplies();
    markDirty();
  },
  "toggle-public": (el) => {
    draft._publicOn = el.checked;
    $("#card-public").classList.toggle("off", !el.checked);
    markDirty();
    renderPreview();
  },
  "toggle-follow": (el) => {
    draft.requireFollow = el.checked;
    $("#card-follow").classList.toggle("off", !el.checked);
    markDirty();
    renderPreview();
  },
  "toggle-linkbtn": (el) => {
    draft._linkBtnOn = el.checked;
    $("#linkbtn-wrap").hidden = !el.checked;
    markDirty();
    renderPreview();
  },
  "save-rule": (el) => saveRule(el),
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  // Checkboxes keep their default toggle; buttons and links don't navigate.
  if (el.tagName !== "INPUT") e.preventDefault();
  Promise.resolve(fn(el, e)).catch(reportError);
});

/* ======================= router ======================= */
let lastHash = location.hash;
async function route() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  closeModal();
  window.scrollTo(0, 0);
  try {
    if (path === "/" || path === "") await viewOverview();
    else if (path === "/automations") await viewAutomations();
    else if (path.startsWith("/automations/")) {
      if (!state.rules) loadRules().catch(() => {});
      await viewEditor(decodeURIComponent(path.slice("/automations/".length)));
    } else if (path === "/activity") await viewActivity(params);
    else if (path === "/settings") await viewSettings();
    else if (path === "/setup") await viewSetup();
    else if (path === "/approval") await viewApproval();
    else location.hash = "#/";
  } catch (e) {
    reportError(e);
  }
}

window.addEventListener("hashchange", () => {
  if (state.dirty && !confirm("You have unsaved changes. Leave without saving?")) {
    history.replaceState(null, "", lastHash || "#/");
    return;
  }
  state.dirty = false;
  lastHash = location.hash;
  route();
});
window.addEventListener("beforeunload", (e) => {
  if (state.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

async function boot() {
  try {
    await api("/api/session");
  } catch {
    return; // login / no-password screen already rendered
  }
  if (!state.rules) loadRules().catch(() => {});
  try {
    // Loads the account for the sidebar on every page.
    const ov = await loadOverview();
    // First visit after login: if the basics aren't connected yet, open the setup wizard instead of empty charts.
    if ((!location.hash || location.hash === "#/") && setupSteps(ov).slice(0, 4).some((s) => !s.done)) {
      history.replaceState(null, "", "#/setup");
      lastHash = "#/setup";
    }
  } catch {}
  route();
}

boot();
