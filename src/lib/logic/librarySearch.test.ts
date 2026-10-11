import { describe, expect, it } from "vitest";
import { q } from "./libraryFixture";
import { normalize, searchQuotes, type SearchContext } from "./librarySearch";

const ctx: SearchContext = {
  writerName: (s) => ({ seneca: "Seneca", marcus: "Marcus Aurelius", shake: "William Shakespeare" })[s] ?? s,
  workTitle: (_w, k) => ({ letters: "Letters to Lucilius", med: "Meditations", macbeth: "Macbeth" })[k] ?? k,
};

const list = [
  q("1", "seneca", "letters", { text: "We suffer more often in imagination than in reality.", plain: "Most of what you fear never happens.", themes: ["fear"], moments: ["afraid"], location: "Letter 13" }),
  q("2", "seneca", "letters", { text: "Hold every hour in your grasp.", plain: "Use today. Do not wait for tomorrow.", themes: ["time", "discipline"], moments: ["tired"], location: "Letter 1" }),
  q("3", "marcus", "med", { text: "It is in thy power to retire into thyself.", plain: "You can always go inward.", themes: ["solitude", "mind"], moments: ["overwhelmed", "alone"], location: "Book 4" }),
  q("4", "shake", "macbeth", { text: "Tomorrow, and tomorrow, and tomorrow,\nCreeps in this petty pace from day to day", plain: "Time drags on and means nothing.", themes: ["time", "death"], moments: ["tired"], location: "Act 5, Scene 5" }),
  q("5", "marcus", "med", { text: "Fear not death, fear never having lived. Imagination is a poor guide.", plain: "A life half lived is the loss.", themes: ["death", "fear"], moments: ["afraid"], location: "Book 12" }),
];
const ids = (r: { hits: { id: string }[] }) => r.hits.map((h) => h.id);

describe("normalizing", () => {
  it("lowercases and strips marks and accents", () => {
    expect(normalize("  Thy POWER, to Retire! ")).toBe("thy power to retire");
    expect(normalize("Épictète's “self-mastery”")).toBe("epictetes self mastery");
  });
});

describe("search", () => {
  it("finds a word in the quote", () => {
    expect(ids(searchQuotes(list, "grasp", ctx))).toEqual(["2"]);
  });

  it("needs every word, in any order", () => {
    expect(ids(searchQuotes(list, "reality imagination", ctx))).toEqual(["1"]);
    expect(ids(searchQuotes(list, "reality tomorrow", ctx))).toEqual([]);
  });

  it("finds a word in the plain line", () => {
    expect(ids(searchQuotes(list, "inward", ctx))).toEqual(["3"]);
  });

  it("finds by writer, work and theme", () => {
    expect(ids(searchQuotes(list, "marcus", ctx)).sort()).toEqual(["3", "5"]);
    expect(ids(searchQuotes(list, "lucilius", ctx)).sort()).toEqual(["1", "2"]);
    expect(ids(searchQuotes(list, "solitude", ctx))).toEqual(["3"]);
    expect(ids(searchQuotes(list, "discipline", ctx))).toEqual(["2"]);
  });

  it("ranks the quote's own words above the plain line and a theme tag", () => {
    // "fear": quote 5 has it in the text, quote 1 in the plain line and as a theme.
    const r = ids(searchQuotes(list, "fear", ctx));
    expect(r[0]).toBe("5");
    expect(r).toContain("1");
  });

  it("ranks a whole word above the start of a word above the middle", () => {
    const set = [q("a", "w", "k", { text: "The unimaginable." }), q("b", "w", "k", { text: "Imagination rules." }), q("c", "w", "k", { text: "An imag of it." })];
    expect(ids(searchQuotes(set, "imag", ctx))).toEqual(["c", "b", "a"]);
  });

  it("ranks a phrase above the same words apart", () => {
    const set = [q("a", "w", "k", { text: "A petty pace, and day after day." }), q("b", "w", "k", { text: "Day to day, a petty pace." })];
    expect(ids(searchQuotes(set, "petty pace", ctx))[0]).toBe("b");
    const apart = [q("a", "w", "k", { text: "Pace yourself, nothing petty here." }), q("b", "w", "k", { text: "A petty pace." })];
    expect(ids(searchQuotes(apart, "petty pace", ctx))[0]).toBe("b");
  });

  it("matches verse across its line breaks and ignores case and accents", () => {
    expect(ids(searchQuotes(list, "TOMORROW creeps", ctx))).toEqual(["4"]);
    expect(ids(searchQuotes([q("a", "w", "k", { text: "Naïve café." })], "naive cafe", ctx))).toEqual(["a"]);
  });

  it("finds a theme typed with its hyphen", () => {
    const set = [q("a", "w", "k", { themes: ["self-mastery"] }), q("b", "w", "k", { themes: ["fear"] })];
    expect(ids(searchQuotes(set, "self-mastery", ctx))).toEqual(["a"]);
  });

  it("returns nothing for nothing, and counts past the limit", () => {
    expect(searchQuotes(list, "   ", ctx)).toEqual({ hits: [], total: 0 });
    expect(searchQuotes(list, "zzzz", ctx).total).toBe(0);
    const many = Array.from({ length: 10 }, (_, i) => q(`q${i}`, "w", "k", { text: "stone" }));
    const r = searchQuotes(many, "stone", ctx, 3);
    expect(r.hits).toHaveLength(3);
    expect(r.total).toBe(10);
  });

  it("keeps reading order between equal scores", () => {
    const many = ["a", "b", "c"].map((id) => q(id, "w", "k", { text: "stone" }));
    expect(ids(searchQuotes(many, "stone", ctx))).toEqual(["a", "b", "c"]);
  });
});
