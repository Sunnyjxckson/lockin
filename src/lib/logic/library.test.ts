import { describe, expect, it } from "vitest";
import {
  READ_DWELL_MAX_MS,
  READ_DWELL_MIN_MS,
  READ_PASS_MS,
  citeQuote,
  countsAsRead,
  dwellMs,
  findInPassage,
  isLaw,
  isMoment,
  isTheme,
  parseScope,
  passageParagraphs,
  quoteLink,
  quoteStep,
  readerLink,
  safeUrl,
  scopeFromQuery,
  scopeQuery,
  scopeTitle,
  themeLabel,
  type Scope,
} from "./library";

const params = (s: string) => new URLSearchParams(s);

describe("scopes and links", () => {
  it("parses each way in", () => {
    expect(parseScope(params("w=seneca"))).toEqual({ kind: "writer", writer: "seneca" });
    expect(parseScope(params("w=seneca&k=letters"))).toEqual({ kind: "writer", writer: "seneca", work: "letters" });
    expect(parseScope(params("t=death"))).toEqual({ kind: "theme", theme: "death" });
    expect(parseScope(params("m=angry"))).toEqual({ kind: "moment", moment: "angry" });
    expect(parseScope(params("shuffle=4821"))).toEqual({ kind: "shuffle", seed: 4821 });
    expect(parseScope(params("saved=1"))).toEqual({ kind: "saved" });
  });

  it("returns null for nothing or nonsense", () => {
    expect(parseScope(params(""))).toBeNull();
    expect(parseScope(params("t=banana"))).toBeNull();
    expect(parseScope(params("m=happy"))).toBeNull();
    expect(parseScope(params("shuffle=abc"))).toBeNull();
    expect(parseScope(params("w=../etc"))).toBeNull();
    expect(parseScope(params("q=x"))).toBeNull();
  });

  it("round trips through the query string", () => {
    const scopes: Scope[] = [
      { kind: "writer", writer: "marcus-aurelius" },
      { kind: "writer", writer: "seneca", work: "on-the-shortness-of-life" },
      { kind: "theme", theme: "self-mastery" },
      { kind: "moment", moment: "tired" },
      { kind: "shuffle", seed: 99 },
      { kind: "saved" },
    ];
    for (const s of scopes) expect(scopeFromQuery(scopeQuery(s))).toEqual(s);
  });

  it("builds the deep link for a quote", () => {
    expect(quoteLink("seneca-letters-letter-12-9f8e7d")).toBe("/library/read?q=seneca-letters-letter-12-9f8e7d");
    expect(quoteLink("seneca-letters-letter-12-9f8e7d", { writer: "seneca" })).toBe("/library/read?w=seneca&q=seneca-letters-letter-12-9f8e7d");
    expect(quoteLink("a b", { scope: { kind: "moment", moment: "angry" } })).toBe("/library/read?m=angry&q=a%20b");
    expect(readerLink(null)).toBe("/library/read");
    expect(readerLink({ kind: "saved" })).toBe("/library/read?saved=1");
  });

  it("names a scope", () => {
    const name = (s: string) => (s === "seneca" ? "Seneca" : null);
    expect(scopeTitle({ kind: "writer", writer: "seneca" }, name)).toBe("Seneca");
    expect(scopeTitle({ kind: "writer", writer: "seneca", work: "l" }, name, () => "Letters")).toBe("Letters");
    expect(scopeTitle({ kind: "theme", theme: "self-mastery" }, name)).toBe("Self-mastery");
    expect(scopeTitle({ kind: "shuffle", seed: 1 }, name)).toBe("Shuffled");
  });

  it("knows the vocabularies", () => {
    expect(isTheme("fear")).toBe(true);
    expect(isTheme("nope")).toBe(false);
    expect(isMoment("tired")).toBe(true);
    expect(isMoment("fear")).toBe(false);
    expect(themeLabel("self-mastery")).toBe("Self-mastery");
  });
});

describe("when a quote counts as read", () => {
  const short = "We suffer more often in imagination than in reality.";
  it("scales the dwell time with the length, within bounds", () => {
    expect(dwellMs("Short.")).toBe(READ_DWELL_MIN_MS);
    expect(dwellMs("x".repeat(100))).toBe(4000);
    expect(dwellMs("x".repeat(5000))).toBe(READ_DWELL_MAX_MS);
  });

  it("does not count a quote that was only loaded", () => {
    expect(countsAsRead({ visibleMs: 0, text: short, movedPast: false })).toBe(false);
    expect(countsAsRead({ visibleMs: 0, text: short, movedPast: true })).toBe(false);
  });

  it("counts a quote you stayed on", () => {
    expect(countsAsRead({ visibleMs: dwellMs(short) - 1, text: short, movedPast: false })).toBe(false);
    expect(countsAsRead({ visibleMs: dwellMs(short), text: short, movedPast: false })).toBe(true);
  });

  it("counts a quote you moved past after a moment, not a flick", () => {
    expect(countsAsRead({ visibleMs: READ_PASS_MS - 1, text: short, movedPast: true })).toBe(false);
    expect(countsAsRead({ visibleMs: READ_PASS_MS, text: short, movedPast: true })).toBe(true);
    expect(countsAsRead({ visibleMs: READ_PASS_MS + 500, text: short, movedPast: false })).toBe(false);
  });
});

describe("type size", () => {
  it("gives short quotes big type and long ones small", () => {
    expect(quoteStep("Know thyself.")).toBe(0);
    expect(quoteStep("x".repeat(200))).toBe(2);
    expect(quoteStep("x".repeat(900))).toBe(6);
  });

  it("sets verse by its lines", () => {
    const verse = "Tomorrow, and tomorrow, and tomorrow,\nCreeps in this petty pace from day to day,\nTo the last syllable of recorded time;\nAnd all our yesterdays have lighted fools\nThe way to dusty death.";
    expect(quoteStep(verse)).toBeGreaterThan(quoteStep("Tomorrow, and tomorrow."));
  });
});

describe("the passage around a quote", () => {
  const passage = "First paragraph here.\n\nWe suffer more often\nin imagination than in reality. And more.\n\nLast one.";

  it("finds the quote across different line breaks", () => {
    const range = findInPassage(passage, "We suffer more often in imagination than in reality.");
    expect(range).not.toBeNull();
    expect(passage.slice(range![0], range![1])).toBe("We suffer more often\nin imagination than in reality.");
  });

  it("marks the quote inside its paragraph", () => {
    const paras = passageParagraphs(passage, "We suffer more often in imagination than in reality.");
    expect(paras).toHaveLength(3);
    expect(paras[0]).toEqual([{ text: "First paragraph here.", hit: false }]);
    expect(paras[1]).toEqual([
      { text: "We suffer more often\nin imagination than in reality.", hit: true },
      { text: " And more.", hit: false },
    ]);
  });

  it("splits a quote that spans paragraphs", () => {
    const paras = passageParagraphs("Alpha beta.\n\nGamma delta.", "Alpha beta. Gamma delta.");
    expect(paras.map((p) => p.map((x) => x.hit))).toEqual([[true], [true]]);
  });

  it("leaves the passage plain when the quote is not in it", () => {
    const paras = passageParagraphs("One.\n\nTwo.", "Something else entirely");
    expect(paras.flat().every((p) => !p.hit)).toBe(true);
  });

  it("copes with an empty passage and with regex marks in the quote", () => {
    expect(passageParagraphs("", "x")).toEqual([]);
    expect(findInPassage("Is it (really) so? Yes.", "(really) so?")).toEqual([6, 18]);
  });

  it("finds a long quote by its first and last words when the middle differs", () => {
    const quote = "one two three four five six seven eight nine ten";
    const text = "one two three four FIVE SIX seven eight nine ten";
    expect(findInPassage(text, quote)).not.toBeNull();
    const other = "one two three four 5 6 seven eight nine ten";
    expect(findInPassage(other, quote)).toEqual([0, other.length]);
  });
});

describe("how a quote is cited", () => {
  const law = { work: "laws", location: "Murphy's law", by: "Attributed to Edward A. Murphy Jr.", year: "1949", source: "Rocket sled tests at Edwards Air Force Base", source_url: "https://example.org/murphy" };

  it("reads a law as its name, who and when, then the source", () => {
    expect(isLaw(law)).toBe(true);
    expect(citeQuote(law, "Laws and maxims")).toEqual({
      title: "Murphy's law",
      lines: ["Attributed to Edward A. Murphy Jr., 1949"],
      source: "Rocket sled tests at Edwards Air Force Base",
      source_url: "https://example.org/murphy",
    });
  });

  it("copes with a law that has no year or no link", () => {
    expect(citeQuote({ ...law, year: "", source_url: "" }, "x").lines).toEqual(["Attributed to Edward A. Murphy Jr."]);
    expect(citeQuote({ ...law, source_url: "" }, "x").source_url).toBeNull();
  });

  it("reads a quote from a work as the work and the place in it", () => {
    expect(isLaw({})).toBe(false);
    expect(citeQuote({ work: "letters", location: "Letter 13" }, "Moral Letters to Lucilius").title).toBe("Moral Letters to Lucilius, Letter 13");
  });

  it("leaves out the plays' own title, which says nothing", () => {
    expect(citeQuote({ work: "plays", location: "Henry V, Act 4 Prologue" }, "The Plays").title).toBe("Henry V, Act 4 Prologue");
  });

  it("only draws a web link as a link", () => {
    expect(safeUrl("https://a.org/x")).toBe("https://a.org/x");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("")).toBeNull();
  });
});
