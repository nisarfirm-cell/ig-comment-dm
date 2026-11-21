export type MatchMode = "word" | "exact" | "contains";

export interface Rule {
  /** Short unique id, letters/digits/-/_ only. Used inside button payloads. */
  id: string;
  name: string;
  enabled: boolean;
  /** Instagram media (reel/post) id, or "any". */
  mediaId: string;
  mediaCaption: string;
  mediaThumb: string;
  /** Any of these triggers the rule. */
  keywords: string[];
  match: MatchMode;
  /** One is picked per comment so replies don't all look identical. Empty = no public reply. */
  publicReplies: string[];
  /** The single private reply Meta allows per comment, with one postback button. */
  dmText: string;
  dmButton: string;
  /** Only send the link when the profile API says the user follows the account. */
  requireFollow: boolean;
  followText: string;
  followButton: string;
  /** Final message. With linkButton + linkUrl it is sent as a button that opens the URL. */
  linkText: string;
  linkUrl: string;
  linkButton: string;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  /** Same person + same automation is not messaged again for this many days. 0 = no limit. */
  cooldownDays: number;
  /** What to do when Meta's profile API cannot tell us the follow status. */
  onFollowCheckError: "send_link" | "ask_follow";
  /** Added to the first DM when Meta refuses the button version and plain text is sent instead. */
  fallbackHint: string;
  /** Shown on the public /privacy page that Meta's App Review asks for. */
  ownerName: string;
  contactEmail: string;
}

export const DEFAULT_SETTINGS: Settings = {
  cooldownDays: 7,
  onFollowCheckError: "send_link",
  fallbackHint: "Reply YES to get the link.",
  ownerName: "",
  contactEmail: "",
};

/** Lowercase, unify compatibility forms, collapse whitespace. */
export function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function isWordChar(ch: string): boolean {
  return ch !== "" && /[\p{L}\p{N}\p{M}_]/u.test(ch);
}

export function keywordMatches(commentText: string, keyword: string, mode: MatchMode = "word"): boolean {
  const text = normalize(commentText);
  const kw = normalize(keyword);
  if (!kw || !text) return false;
  if (mode === "exact") return text === kw;
  if (mode === "contains") return text.includes(kw);
  // "word": keyword bounded by non letter/digit characters (Unicode aware, so Tamil/Hindi text works).
  let from = 0;
  for (;;) {
    const i = text.indexOf(kw, from);
    if (i === -1) return false;
    const before = i === 0 ? "" : [...text.slice(0, i)].pop()!;
    const rest = text.slice(i + kw.length);
    const after = rest ? [...rest][0] : "";
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = i + 1;
  }
}

export function ruleMatches(rule: Rule, commentText: string): boolean {
  return rule.keywords.some((k) => keywordMatches(commentText, k, rule.match));
}

/** First enabled matching rule. Rules for the specific media win over "any" rules. */
export function findRule(rules: Rule[], mediaId: string | undefined, commentText: string): Rule | undefined {
  const live = rules.filter((r) => r.enabled);
  const specific = live.filter((r) => r.mediaId !== "any" && r.mediaId === mediaId);
  const any = live.filter((r) => r.mediaId === "any");
  return [...specific, ...any].find((r) => ruleMatches(r, commentText));
}

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;
const str = (v: unknown, max = 5000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : []);

/** Builds the final link message text (used when there is no link button). */
export function linkPlainText(rule: Pick<Rule, "linkText" | "linkUrl">): string {
  return [rule.linkText, rule.linkUrl].filter(Boolean).join("\n");
}

/**
 * Turns untrusted dashboard input into a Rule, checking the limits in Meta's docs:
 * button template text up to 640 characters, text messages up to 1000 bytes.
 */
export function parseRuleInput(input: any, existing?: Rule): { rule?: Rule; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const now = Date.now();
  const match = (["word", "exact", "contains"] as const).find((m) => m === input?.match) ?? "word";
  const keywords = [...new Set(strList(input?.keywords).map((k) => k.slice(0, 40)))];
  const rule: Rule = {
    id: existing?.id ?? newId(),
    name: str(input?.name, 60) || keywords[0] || "Untitled automation",
    enabled: input?.enabled === undefined ? (existing?.enabled ?? true) : Boolean(input.enabled),
    mediaId: str(input?.mediaId, 40) || "any",
    mediaCaption: str(input?.mediaCaption, 200),
    mediaThumb: str(input?.mediaThumb, 2000),
    keywords,
    match,
    publicReplies: strList(input?.publicReplies).slice(0, 5),
    dmText: str(input?.dmText),
    dmButton: str(input?.dmButton),
    requireFollow: Boolean(input?.requireFollow),
    followText: str(input?.followText),
    followButton: str(input?.followButton),
    linkText: str(input?.linkText),
    linkUrl: str(input?.linkUrl, 2000),
    linkButton: str(input?.linkButton),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (rule.mediaId !== "any" && !/^\d{1,40}$/.test(rule.mediaId)) errors.mediaId = 'Pick a post or "Any post".';
  if (keywords.length === 0) errors.keywords = "Add at least one keyword.";
  if (keywords.length > 20) errors.keywords = "Up to 20 keywords.";
  if (rule.publicReplies.some((r) => r.length > 300)) errors.publicReplies = "Each public reply can be up to 300 characters.";
  if (!rule.dmText) errors.dmText = "Write the first DM.";
  else if (rule.dmText.length > 640) errors.dmText = "Up to 640 characters (Meta limit for button messages).";
  if (!rule.dmButton) errors.dmButton = "Give the button a label.";
  else if (rule.dmButton.length > 20) errors.dmButton = "Keep the button label to 20 characters.";
  if (rule.requireFollow) {
    if (!rule.followText) errors.followText = "Write the 'please follow' message.";
    else if (rule.followText.length > 640) errors.followText = "Up to 640 characters.";
    if (!rule.followButton) errors.followButton = "Give the re-check button a label.";
    else if (rule.followButton.length > 20) errors.followButton = "Keep the button label to 20 characters.";
  }
  if (rule.linkUrl && !/^https?:\/\/[^\s]+$/i.test(rule.linkUrl)) errors.linkUrl = "Must start with https://";
  if (!rule.linkText && !rule.linkUrl) errors.linkText = "Write the final message or add a link.";
  if (rule.linkButton) {
    if (!rule.linkUrl) errors.linkButton = "A link button needs a link.";
    else if (rule.linkButton.length > 20) errors.linkButton = "Keep the button label to 20 characters.";
    if (rule.linkText.length > 640) errors.linkText = "Up to 640 characters when sent with a button.";
  } else if (utf8Bytes(linkPlainText(rule)) > 1000) {
    errors.linkText = "Message plus link must be under 1000 bytes (Meta limit).";
  }
  return Object.keys(errors).length ? { errors } : { rule, errors };
}

export function parseSettingsInput(input: any): { settings?: Settings; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const cooldownDays = Number(input?.cooldownDays);
  if (!Number.isInteger(cooldownDays) || cooldownDays < 0 || cooldownDays > 365) errors.cooldownDays = "Use a whole number from 0 to 365.";
  const onFollowCheckError = input?.onFollowCheckError === "ask_follow" ? "ask_follow" : "send_link";
  const fallbackHint = str(input?.fallbackHint, 200) || DEFAULT_SETTINGS.fallbackHint;
  const ownerName = str(input?.ownerName, 100);
  const contactEmail = str(input?.contactEmail, 200);
  if (contactEmail && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(contactEmail)) errors.contactEmail = "Enter a valid email address.";
  return Object.keys(errors).length
    ? { errors }
    : { settings: { cooldownDays, onFollowCheckError, fallbackHint, ownerName, contactEmail }, errors };
}

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
