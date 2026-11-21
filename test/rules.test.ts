import { describe, expect, it } from "vitest";
import { findRule, keywordMatches, parseRuleInput, parseSettingsInput } from "../src/rules";
import { makeRule } from "./helpers";

describe("keyword matching", () => {
  it("matches whole words, ignoring case and punctuation", () => {
    for (const text of ["REPO", "repo", "Repo please", "bro REPO!", "send repo.", "  repo  ", "🔥repo🔥", "repo\nplease"]) {
      expect(keywordMatches(text, "REPO"), text).toBe(true);
    }
  });

  it("does not match inside longer words", () => {
    for (const text of ["report", "repository", "myrepo", "repo2", "", "nice video"]) {
      expect(keywordMatches(text, "REPO"), text).toBe(false);
    }
  });

  it("finds a later whole-word hit after a partial one", () => {
    expect(keywordMatches("reports are fine, repo please", "repo")).toBe(true);
  });

  it("works next to Tamil text and with multi-word keywords", () => {
    expect(keywordMatches("repo வேணும்", "REPO")).toBe(true);
    expect(keywordMatches("i want the source code bro", "source code")).toBe(true);
    expect(keywordMatches("லிங்க் அனுப்புங்க", "லிங்க்")).toBe(true);
  });

  it("supports exact and contains modes", () => {
    expect(keywordMatches("repo", "REPO", "exact")).toBe(true);
    expect(keywordMatches("repo please", "REPO", "exact")).toBe(false);
    expect(keywordMatches("myrepo", "REPO", "contains")).toBe(true);
  });

  it("never matches an empty keyword", () => {
    expect(keywordMatches("anything", "  ")).toBe(false);
  });
});

describe("rule selection", () => {
  const rules = [
    makeRule({ id: "any-repo", mediaId: "any", keywords: ["REPO", "code"] }),
    makeRule({ id: "reel-repo", mediaId: "111", keywords: ["REPO"] }),
    makeRule({ id: "reel-notes", mediaId: "111", keywords: ["NOTES"] }),
    makeRule({ id: "paused", mediaId: "any", keywords: ["PDF"], enabled: false }),
  ];

  it("prefers the rule for the specific reel over an 'any' rule", () => {
    expect(findRule(rules, "111", "repo")?.id).toBe("reel-repo");
  });

  it("falls back to the 'any' rule on other reels and matches any of its keywords", () => {
    expect(findRule(rules, "222", "repo")?.id).toBe("any-repo");
    expect(findRule(rules, undefined, "code pls")?.id).toBe("any-repo");
  });

  it("keeps reel-only keywords on their reel", () => {
    expect(findRule(rules, "111", "notes")?.id).toBe("reel-notes");
    expect(findRule(rules, "222", "notes")).toBeUndefined();
  });

  it("ignores paused automations and non-matching comments", () => {
    expect(findRule(rules, "111", "pdf")).toBeUndefined();
    expect(findRule(rules, "111", "super video")).toBeUndefined();
  });
});

describe("dashboard input validation", () => {
  const good = { ...makeRule(), id: undefined };

  it("accepts a valid automation and trims / de-duplicates keywords", () => {
    const { rule, errors } = parseRuleInput({ ...good, keywords: [" REPO ", "REPO", "code"], publicReplies: ["hi", ""] });
    expect(errors).toEqual({});
    expect(rule!.keywords).toEqual(["REPO", "code"]);
    expect(rule!.publicReplies).toEqual(["hi"]);
    expect(rule!.id).toMatch(/^[0-9a-f]{12}$/);
  });

  it("keeps the id and creation time when editing", () => {
    const existing = makeRule({ id: "keepme", createdAt: 42 });
    const { rule } = parseRuleInput({ ...good, name: "Renamed" }, existing);
    expect(rule!.id).toBe("keepme");
    expect(rule!.createdAt).toBe(42);
    expect(rule!.name).toBe("Renamed");
  });

  it("enforces Meta's limits and required fields", () => {
    const { rule, errors } = parseRuleInput({
      ...good,
      keywords: [],
      dmText: "x".repeat(641),
      dmButton: "a very long button label",
      followText: "",
      linkUrl: "javascript:alert(1)",
      mediaId: "not-a-number",
    });
    expect(rule).toBeUndefined();
    expect(Object.keys(errors).sort()).toEqual(["dmButton", "dmText", "followText", "keywords", "linkUrl", "mediaId"]);
  });

  it("checks the 1000-byte text limit and link-button rules", () => {
    expect(parseRuleInput({ ...good, linkText: "த".repeat(400) }).errors.linkText).toMatch(/1000 bytes/);
    expect(parseRuleInput({ ...good, linkButton: "Open", linkUrl: "" }).errors.linkButton).toBeDefined();
    expect(parseRuleInput({ ...good, linkText: "", linkUrl: "" }).errors.linkText).toBeDefined();
  });

  it("does not require follow-gate texts when the gate is off", () => {
    expect(parseRuleInput({ ...good, requireFollow: false, followText: "", followButton: "" }).errors).toEqual({});
  });

  it("validates settings", () => {
    expect(parseSettingsInput({ cooldownDays: 3, onFollowCheckError: "ask_follow", fallbackHint: "" }).settings).toEqual({
      cooldownDays: 3,
      onFollowCheckError: "ask_follow",
      fallbackHint: "Reply YES to get the link.",
      ownerName: "",
      contactEmail: "",
    });
    expect(parseSettingsInput({ cooldownDays: 3, contactEmail: "not-an-email" }).errors.contactEmail).toBeDefined();
    expect(parseSettingsInput({ cooldownDays: 3, contactEmail: "me@example.com" }).settings?.contactEmail).toBe("me@example.com");
    expect(parseSettingsInput({ cooldownDays: -1 }).errors.cooldownDays).toBeDefined();
    expect(parseSettingsInput({ cooldownDays: 1.5 }).errors.cooldownDays).toBeDefined();
  });
});
