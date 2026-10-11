import { describe, expect, it } from "vitest";
import { index, marks, q, quotes } from "./libraryFixture";
import { buildQueue, daySeed, interleave, newSeed, pickQuote, readOnDate, scopeCounts, scopeQuotes, seeded, shuffled } from "./libraryQueue";

const ids = (list: { id: string }[]) => list.map((x) => x.id);

describe("seeded order", () => {
  it("gives the same numbers for the same seed", () => {
    const a = seeded(7);
    const b = seeded(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seeded(8)()).not.toBe(seeded(7)());
  });

  it("shuffles the same way every time and keeps everything", () => {
    const list = ids(quotes());
    const one = shuffled(list, 123);
    expect(shuffled(list, 123)).toEqual(one);
    expect([...one].sort()).toEqual([...list].sort());
    expect(shuffled(list, 124)).not.toEqual(one);
    expect(list).toEqual(ids(quotes()));
  });

  it("makes seeds that are whole numbers above zero", () => {
    for (let i = 0; i < 20; i++) {
      const s = newSeed();
      expect(Number.isInteger(s) && s > 0).toBe(true);
    }
  });
});

describe("scope order", () => {
  const all = quotes();

  it("goes through one writer in source order, or one work", () => {
    expect(ids(scopeQuotes({ kind: "writer", writer: "seneca" }, all, marks()))).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(ids(scopeQuotes({ kind: "writer", writer: "seneca", work: "essays" }, all, marks()))).toEqual(["s4", "s5"]);
    expect(scopeQuotes({ kind: "writer", writer: "nobody" }, all, marks())).toEqual([]);
  });

  it("takes a theme or a moment across writers in turn", () => {
    const list = [
      q("a1", "a", "w", { themes: ["death"], moments: ["afraid"] }),
      q("a2", "a", "w", { themes: ["death"] }),
      q("a3", "a", "w", { themes: ["death"] }),
      q("b1", "b", "w", { themes: ["death"], moments: ["afraid"] }),
      q("b2", "b", "w", { themes: ["time"] }),
      q("c1", "c", "w", { themes: ["death"] }),
    ];
    expect(ids(scopeQuotes({ kind: "theme", theme: "death" }, list, marks()))).toEqual(["a1", "b1", "c1", "a2", "a3"]);
    expect(ids(scopeQuotes({ kind: "moment", moment: "afraid" }, list, marks()))).toEqual(["a1", "b1"]);
  });

  it("interleaves with every quote used once and each writer's order kept", () => {
    const list = [q("a1", "a", "w"), q("a2", "a", "w"), q("a3", "a", "w"), q("a4", "a", "w"), q("b1", "b", "w"), q("b2", "b", "w")];
    const out = ids(interleave(list));
    expect([...out].sort()).toEqual(ids(list).sort());
    expect(out.filter((i) => i.startsWith("a"))).toEqual(["a1", "a2", "a3", "a4"]);
    expect(out.filter((i) => i.startsWith("b"))).toEqual(["b1", "b2"]);
    // The smaller writer is spread out, not used up first.
    expect(out.indexOf("b2")).toBeGreaterThan(out.indexOf("a2"));
  });

  it("shuffles everyone with a stable seeded order", () => {
    const a = ids(scopeQuotes({ kind: "shuffle", seed: 5 }, all, marks()));
    expect(ids(scopeQuotes({ kind: "shuffle", seed: 5 }, all, marks()))).toEqual(a);
    expect(a).toHaveLength(8);
  });

  it("lists the saved ones newest first", () => {
    const m = marks({ saved: ["s2", "m1", "s5"] });
    expect(ids(scopeQuotes({ kind: "saved" }, all, m))).toEqual(["s5", "m1", "s2"]);
  });
});

describe("no repeats until you finish", () => {
  const all = quotes();
  const seneca = { kind: "writer", writer: "seneca" } as const;
  const scoped = (m: ReturnType<typeof marks>) => scopeQuotes(seneca, all, m);

  it("starts with every quote unread", () => {
    const queue = buildQueue(seneca, scoped(marks()), marks());
    expect(queue).toEqual({ ids: ["s1", "s2", "s3", "s4", "s5"], pass: 1, review: false, start: 0 });
  });

  it("leaves out what was read, and keeps the order", () => {
    const m = marks({ read: ["s1", "s3"] });
    expect(buildQueue(seneca, scoped(m), m).ids).toEqual(["s2", "s4", "s5"]);
  });

  it("opens on a chosen unread quote without dropping the ones before it", () => {
    const m = marks({ read: ["s1"] });
    const queue = buildQueue(seneca, scoped(m), m, { startAt: "s4" });
    expect(queue.ids).toEqual(["s2", "s3", "s4", "s5"]);
    expect(queue.start).toBe(2);
  });

  it("puts a chosen quote that is already read in front, once", () => {
    const m = marks({ read: ["s1", "s2"] });
    const queue = buildQueue(seneca, scoped(m), m, { startAt: "s2" });
    expect(queue.ids).toEqual(["s2", "s3", "s4", "s5"]);
    expect(queue.start).toBe(0);
    expect(queue.pass).toBe(1);
  });

  it("ignores a start that is not in the scope", () => {
    const m = marks();
    expect(buildQueue(seneca, scoped(m), m, { startAt: "m1" })).toMatchObject({ start: 0, ids: ["s1", "s2", "s3", "s4", "s5"] });
  });

  it("starts a second pass when everything is read, from after where you were", () => {
    const m = marks({ read: ["s1", "s2", "s3", "s4", "s5"] });
    const queue = buildQueue(seneca, scoped(m), m, { after: "s3" });
    expect(queue.pass).toBe(2);
    expect(queue.ids).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(queue.start).toBe(3);
    expect(buildQueue(seneca, scoped(m), m, { after: "s5" }).start).toBe(0);
    expect(buildQueue(seneca, scoped(m), m).start).toBe(0);
  });

  it("goes by the scope, not the whole library", () => {
    // Seneca is all read, Marcus is not: a Marcus scope is still on its first pass.
    const m = marks({ read: ["s1", "s2", "s3", "s4", "s5"] });
    const marcus = { kind: "writer", writer: "marcus" } as const;
    expect(buildQueue(marcus, scopeQuotes(marcus, all, m), m).pass).toBe(1);
  });

  it("reviews a collection whether or not it was read", () => {
    const m = marks({ read: ["s1"], saved: ["s1", "s2"] });
    const saved = { kind: "saved" } as const;
    const queue = buildQueue(saved, scopeQuotes(saved, all, m), m, { startAt: "s1" });
    expect(queue.review).toBe(true);
    expect(queue.ids).toEqual(["s2", "s1"]);
    expect(queue.start).toBe(1);
  });

  it("handles an empty scope", () => {
    expect(buildQueue(seneca, [], marks())).toMatchObject({ ids: [], pass: 2, start: 0 });
  });
});

describe("counts in a scope", () => {
  it("counts the read ones", () => {
    const m = marks({ read: ["s1", "m1"] });
    expect(scopeCounts(quotes().slice(0, 5), m)).toEqual({ read: 1, total: 5 });
  });
});

describe("picking one quote", () => {
  const list = [
    q("a", "x", "w", { moments: ["angry"], themes: ["anger"] }),
    q("b", "x", "w", { moments: ["angry"] }),
    q("c", "y", "w", { moments: ["angry"] }),
    q("d", "y", "w", { moments: ["tired"] }),
  ];
  const none = marks();

  it("is the same for the same seed and different across seeds", () => {
    const one = pickQuote(list, none, { moment: "angry", seed: 3 });
    expect(pickQuote(list, none, { moment: "angry", seed: 3 })).toEqual(one);
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) seen.add(pickQuote(list, none, { moment: "angry", seed: s })!.id);
    expect(seen.size).toBeGreaterThan(1);
    expect([...seen].every((i) => ["a", "b", "c"].includes(i))).toBe(true);
  });

  it("prefers unread, then falls back to read ones", () => {
    const m = marks();
    m.set("a", { quote_id: "a", writer: "x", work: "w", read_at: "2026-10-01T00:00:00.000Z", saved_at: null, note: null });
    m.set("b", { quote_id: "b", writer: "x", work: "w", read_at: "2026-10-01T00:00:00.000Z", saved_at: null, note: null });
    for (let s = 0; s < 20; s++) expect(pickQuote(list, m, { moment: "angry", seed: s })!.id).toBe("c");
    m.set("c", { quote_id: "c", writer: "y", work: "w", read_at: "2026-10-01T00:00:00.000Z", saved_at: null, note: null });
    expect(pickQuote(list, m, { moment: "angry", seed: 1 })).not.toBeNull();
    expect(pickQuote(list, m, { moment: "angry", seed: 1, unread: "strict" })).toBeNull();
  });

  it("filters by theme and writer, and skips excluded ids", () => {
    expect(pickQuote(list, none, { theme: "anger", seed: 1 })!.id).toBe("a");
    expect(pickQuote(list, none, { writer: "y", moment: "tired", seed: 9 })!.id).toBe("d");
    expect(pickQuote(list, none, { moment: "angry", seed: 1, exclude: ["a", "b"] })!.id).toBe("c");
    expect(pickQuote(list, none, { moment: "broke", seed: 1 })).toBeNull();
    expect(pickQuote([], none, { seed: 1 })).toBeNull();
  });

  it("makes a day seed that is steady within a day", () => {
    expect(daySeed("2026-10-11")).toBe(daySeed("2026-10-11"));
    expect(daySeed("2026-10-11")).not.toBe(daySeed("2026-10-12"));
    expect(daySeed("2026-10-11", 2)).not.toBe(daySeed("2026-10-11", 3));
  });
});

describe("read today", () => {
  it("counts by the New York date, not the UTC one", () => {
    const m = marks();
    const set = (id: string, at: string) => m.set(id, { quote_id: id, writer: "seneca", work: "letters", read_at: at, saved_at: null, note: null });
    set("s1", "2026-10-11T03:30:00.000Z"); // 11:30 pm on Oct 10 in New York
    set("s2", "2026-10-11T04:00:00.000Z"); // midnight Oct 11
    set("s3", "2026-10-11T20:00:00.000Z");
    set("s4", "2026-10-12T03:59:00.000Z"); // 11:59 pm Oct 11
    set("s5", "2026-10-12T04:00:00.000Z"); // Oct 12
    m.set("m1", { quote_id: "m1", writer: "marcus", work: "meditations", read_at: null, saved_at: "2026-10-11T12:00:00.000Z", note: null });
    expect(readOnDate(m, "2026-10-11")).toBe(3);
    expect(readOnDate(m, "2026-10-10")).toBe(1);
    expect(readOnDate(m, "2026-10-09")).toBe(0);
  });

  it("is zero with nothing read", () => {
    expect(readOnDate(marks(), "2026-10-11")).toBe(0);
    expect(index().total).toBe(8);
  });
});
