import { describe, expect, it } from "vitest";
import { index, marks } from "./libraryFixture";
import { fraction, isRoundNumber, libraryCounts, milestonesAfterRead, percent, savedCount, writerCounts } from "./libraryProgress";

describe("counters", () => {
  it("counts overall, per writer and per work", () => {
    const c = libraryCounts(index(), marks({ read: ["s1", "s2", "s4", "m1"], saved: ["s1"] }));
    expect(c.overall).toEqual({ read: 4, total: 8 });
    expect(c.writers.map((w) => [w.slug, w.read, w.total])).toEqual([
      ["seneca", 3, 5],
      ["marcus", 1, 3],
    ]);
    expect(c.writers[0].works.map((w) => [w.slug, w.read, w.total])).toEqual([
      ["letters", 2, 3],
      ["essays", 1, 2],
    ]);
  });

  it("is zero with nothing read and ignores saved-only quotes", () => {
    expect(libraryCounts(index(), marks()).overall).toEqual({ read: 0, total: 8 });
    expect(libraryCounts(index(), marks({ saved: ["s1", "s2"] })).overall.read).toBe(0);
    expect(savedCount(marks({ saved: ["s1", "s2"] }))).toBe(2);
  });

  it("never counts past a total, and the overall is the sum of the writers", () => {
    const m = marks({ read: ["s1"] });
    for (const id of ["x1", "x2", "x3", "x4", "x5", "x6"]) m.set(id, { quote_id: id, writer: "seneca", work: "letters", read_at: "2026-10-01T00:00:00.000Z", saved_at: null, note: null });
    const c = libraryCounts(index(), m);
    expect(c.writers[0].read).toBe(5);
    expect(c.writers[0].works[0].read).toBe(3);
    expect(c.overall.read).toBe(5);
  });

  it("gives percent and fraction", () => {
    expect(percent({ read: 1, total: 3 })).toBe(33);
    expect(percent({ read: 0, total: 0 })).toBe(0);
    expect(fraction({ read: 6, total: 3 })).toBe(1);
  });

  it("finds one writer", () => {
    expect(writerCounts(index(), marks({ read: ["m1"] }), "marcus")).toMatchObject({ read: 1, total: 3 });
    expect(writerCounts(index(), marks(), "nobody")).toBeNull();
  });
});

describe("milestones", () => {
  it("fires for a writer finished", () => {
    const m = marks({ read: ["m1", "m2", "m3"] });
    expect(milestonesAfterRead(index(), m, "marcus")).toEqual([{ kind: "writer", slug: "marcus", name: "Marcus Aurelius", count: 3 }]);
  });

  it("does not fire for a writer part way", () => {
    expect(milestonesAfterRead(index(), marks({ read: ["m1", "m2"] }), "marcus")).toEqual([]);
  });

  it("fires for the whole library, with the writer under it", () => {
    const m = marks({ read: ["s1", "s2", "s3", "s4", "s5", "m1", "m2", "m3"] });
    expect(milestonesAfterRead(index(), m, "marcus").map((x) => x.kind)).toEqual(["library", "writer"]);
  });

  it("fires on round numbers", () => {
    const ix = { total: 400, writers: [{ slug: "w", name: "W", count: 400, works: [{ slug: "k", title: "K", count: 400 }] }] };
    const readN = (n: number) => {
      const m = marks();
      for (let i = 0; i < n; i++) m.set(`w${i}`, { quote_id: `w${i}`, writer: "w", work: "k", read_at: "2026-10-01T00:00:00.000Z", saved_at: null, note: null });
      return m;
    };
    expect(milestonesAfterRead(ix, readN(100), "w")).toEqual([{ kind: "count", read: 100 }]);
    expect(milestonesAfterRead(ix, readN(101), "w")).toEqual([]);
    // 400 is the whole library: that is the milestone, not a round number.
    expect(milestonesAfterRead(ix, readN(400), "w").map((x) => x.kind)).toEqual(["library", "writer"]);
  });

  it("knows the round numbers", () => {
    expect([1, 9, 10, 25, 50, 100, 250, 499, 500, 750, 1000, 1500].filter(isRoundNumber)).toEqual([10, 25, 50, 100, 250, 500, 1000, 1500]);
    expect(isRoundNumber(0)).toBe(false);
  });
});
