import { describe, expect, it } from "vitest";
import { candidateLine, cleanCandidates, isLibKey, libId, libKey, libraryQuotesIn, misquotedFrom, momentsFor, pickCandidates, type LibCandidate } from "./coachLibrary";
import type { ShortPool } from "./drops";

const POOL: ShortPool = {
  names: { seneca: "Seneca", laws: "The 48 Laws" },
  quotes: [
    ...Array.from({ length: 12 }, (_, i) => ({ id: `seneca-letters-letter-${i}-a${i}b`, w: "seneca", t: `Tired line number ${i} here.`, m: ["tired"] })),
    { id: "seneca-letters-letter-90-zz1", w: "seneca", t: "Angry line about anger.", m: ["angry"] },
    { id: "laws-law-1-qq1", w: "laws", t: "Never outshine the master.", m: ["tired"] },
  ],
};
const base = { topic: "tired", message: "so tired today", saved: new Set<string>(), read: new Set<string>(), used: [] as string[], date: "2026-10-11" };

describe("coach library keys", () => {
  it("round trips and rejects odd keys", () => {
    expect(libId(libKey("seneca-a-1-abc"))).toBe("seneca-a-1-abc");
    expect(libId("pain_optional")).toBeNull();
    expect(libId(null)).toBeNull();
    expect(isLibKey("lib:seneca-a-1-abc")).toBe(true);
    expect(isLibKey("lib:bad key")).toBe(false);
  });
});

describe("momentsFor", () => {
  it("reads the words first, then the topic, and gives nothing for safety topics or a win", () => {
    expect(momentsFor("general", "I am so angry")[0]).toBe("angry");
    expect(momentsFor("money", "rent is due")).toContain("broke");
    for (const t of ["care", "emergency", "injury", "win"]) expect(momentsFor(t, "angry tired")).toEqual([]);
  });
});

describe("pickCandidates", () => {
  it("is the same for the same message and day, bounded, and skips laws", () => {
    const a = pickCandidates(POOL, base);
    expect(a).toEqual(pickCandidates(POOL, base));
    expect(a.length).toBeLessThanOrEqual(6);
    expect(a.some((c) => c.key.includes("laws"))).toBe(false);
  });
  it("puts saved first, then unread, and leaves out lines used this week", () => {
    const saved = new Set(["seneca-letters-letter-7-a7b"]);
    const read = new Set(POOL.quotes.slice(0, 11).map((q) => q.id));
    const a = pickCandidates(POOL, { ...base, saved, read, count: 3 });
    expect(a[0].key).toBe("lib:seneca-letters-letter-7-a7b");
    expect(a[0].saved).toBe(true);
    expect(a[1].key).toBe("lib:seneca-letters-letter-11-a11b");
    const b = pickCandidates(POOL, { ...base, used: ["lib:seneca-letters-letter-11-a11b"] });
    expect(b.map((c) => c.key)).not.toContain("lib:seneca-letters-letter-11-a11b");
  });
  it("gives none for safety topics", () => {
    expect(pickCandidates(POOL, { ...base, topic: "care" })).toEqual([]);
    expect(pickCandidates(POOL, { ...base, topic: "injury" })).toEqual([]);
  });
});

describe("reading what was quoted", () => {
  const lib: LibCandidate[] = [{ key: "lib:x-1-aaa", text: "We suffer more in imagination than in reality.", by: "Seneca" }];
  it("finds a whole line, and flags a cut or reworded one", () => {
    expect(libraryQuotesIn(`"${lib[0].text}" Seneca.`, lib)).toEqual(["lib:x-1-aaa"]);
    expect(misquotedFrom("We suffer more in imagination than in dreams.", lib)).toHaveLength(1);
    expect(misquotedFrom(`"${lib[0].text}"`, lib)).toHaveLength(0);
    expect(candidateLine(lib[0])).toBe('"We suffer more in imagination than in reality." Seneca.');
  });
  it("cleans what a request carried", () => {
    expect(cleanCandidates([...lib, { key: "nope", text: "x".repeat(20), by: "A" }, { key: "lib:y", text: 'has "quote" inside here', by: "A" }, 5])).toEqual(lib);
    expect(cleanCandidates("x")).toEqual([]);
  });
});
