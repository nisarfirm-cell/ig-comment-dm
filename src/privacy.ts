/**
 * Public privacy policy page. Meta's App Review asks for a privacy policy URL; this page
 * describes exactly what AutoDM stores, using the owner's details from Settings.
 * The #delete section can also be given to Meta as data deletion instructions.
 */
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface PrivacyInput {
  ownerName: string;
  contactEmail: string;
  username: string | null;
}

export function privacyHtml(p: PrivacyInput): string {
  const who = p.ownerName || (p.username ? `@${p.username}` : "the owner of this Instagram account");
  const account = p.username ? `@${p.username}` : "our Instagram professional account";
  const contact = p.contactEmail
    ? `email <a href="mailto:${esc(p.contactEmail)}">${esc(p.contactEmail)}</a>`
    : p.username
      ? `send a direct message to <a href="https://www.instagram.com/${encodeURIComponent(p.username)}/">@${esc(p.username)}</a> on Instagram`
      : "send a direct message to our Instagram account";
  const updated = new Date().toISOString().slice(0, 10);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Privacy Policy</title>
<style>
:root{color-scheme:light dark;--t:#0a0a0a;--m:#666;--b:#e5e5e5;--bg:#fff}
@media(prefers-color-scheme:dark){:root{--t:#f5f5f5;--m:#999;--b:#262626;--bg:#000}}
body{margin:0;background:var(--bg);color:var(--t);font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:680px;margin:0 auto;padding:56px 20px 80px}
h1{font-size:30px;letter-spacing:-.02em;margin:0 0 4px}h2{font-size:18px;margin:36px 0 8px;letter-spacing:-.01em}
p,li{color:var(--t)}.m{color:var(--m);font-size:14px}a{color:inherit}
ul{padding-left:20px}hr{border:0;border-top:1px solid var(--b);margin:40px 0 16px}
</style></head><body><main>
<h1>Privacy Policy</h1>
<p class="m">Last updated ${updated}</p>

<p>This page explains how ${esc(who)} (“we”) handles information when you interact with ${esc(account)} on Instagram through our automated replies.</p>

<h2>What this service does</h2>
<p>When you comment a keyword on one of our posts or reels, our system replies to your comment and sends you a direct message with the content you asked for (for example a link). If you tap a button in that message, it may check whether you follow our account before sending the link.</p>

<h2>Information we process</h2>
<ul>
<li>Your Instagram-scoped user ID and username, provided by Meta when you comment or message us.</li>
<li>The text of the comment that contained the keyword.</li>
<li>Which buttons you tapped in our messages and whether a message was delivered.</li>
<li>Whether you follow our account, as reported by Meta's Instagram API at the moment you tap the button.</li>
</ul>
<p>We do not ask for, collect or store your password, email, phone number, location or contacts.</p>

<h2>How we use it</h2>
<ul>
<li>To send you the reply and link you requested.</li>
<li>To avoid messaging you more than once for the same request.</li>
<li>To see simple statistics, such as how many links were sent.</li>
</ul>
<p>We do not sell your information, use it for advertising, or share it with anyone except Meta (which delivers the messages) and Cloudflare (which hosts this service).</p>

<h2>How long we keep it</h2>
<p>Activity records are deleted automatically after 90 days. Records used to avoid duplicate messages expire after at most a few weeks.</p>

<h2 id="delete">How to delete your data</h2>
<p>To have your information deleted, ${contact} and tell us your Instagram username. We delete it within 30 days. You can also stop all messages at any time by blocking or restricting our account on Instagram.</p>

<h2>Contact</h2>
<p>Questions about this policy: ${contact}.</p>

<hr><p class="m">This service uses Meta's official Instagram API and is not operated by or affiliated with Meta.</p>
</main></body></html>`;
}
