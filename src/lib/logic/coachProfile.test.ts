import { describe, expect, it } from "vitest";
import { MAX_NOTE, MAX_PER_KIND, cleanNote, dedupeNotes, extractPrompt, overflow, parseNotes, profileLines, sameNote, type Stored } from "./coachProfile";

const DASHES = /[\u2012-\u2015\u2212]/;

function stored(id: string, kind: Stored["kind"], body: string, updated = "2026-10-01T00:00:00.000Z"): Stored & { updated_at: string } {
  return { id, kind, body, updated_at: updated };
}

describe("cleanNote", () => {
  it("keeps a plain note and strips dashes, markdown and extra space", () => {
    expect(cleanNote({ kind: "why", body: "  Wants to be there for his kid \u2014 every day  " })?.body).toBe("Wants to be there for his kid, every day");
    expect(cleanNote({ kind: "trigger", body: "**Slips** after   late shifts." })?.body).toBe("Slips after late shifts.");
  });

  it("drops a note with a bad kind, no body or almost nothing in it", () => {
    expect(cleanNote({ kind: "mood", body: "Feels sad today" })).toBeNull();
    expect(cleanNote({ kind: "why", body: 4 })).toBeNull();
    expect(cleanNote({ kind: "why", body: "ok" })).toBeNull();
    expect(cleanNote({ body: "No kind at all here" })).toBeNull();
  });

  it("cuts a long note", () => {
    const n = cleanNote({ kind: "said", body: "word ".repeat(100) });
    expect(n && n.body.length).toBeLessThanOrEqual(MAX_NOTE);
  });
});

describe("sameNote", () => {
  it("matches the same words, case and punctuation aside", () => {
    expect(sameNote("Slips after a late shift", "slips after a late shift.")).toBe(true);
  });

  it("matches one note inside another", () => {
    expect(sameNote("Wants to get lean for the runway", "Wants to get lean for the runway, and for Sedition")).toBe(true);
  });

  it("matches mostly the same words in a different order or form", () => {
    expect(sameNote("Slips when he is alone at night", "Slipping at night when alone")).toBe(true);
    expect(sameNote("Studies best right after the gym", "Study best after gym")).toBe(true);
  });

  it("keeps two different notes apart", () => {
    expect(sameNote("Slips after a late shift", "Wants to finish his degree")).toBe(false);
    expect(sameNote("Lifting at 6:30 gets him moving", "Walking after dinner gets him moving")).toBe(false);
  });
});

describe("dedupeNotes", () => {
  const existing = [stored("a", "trigger", "Slips after a late delivery shift"), stored("b", "why", "Wants to finish his degree")];

  it("adds a new note", () => {
    expect(dedupeNotes(existing, [{ kind: "what_works", body: "Cold water on his face gets him through urges" }])).toEqual({
      add: [{ kind: "what_works", body: "Cold water on his face gets him through urges" }],
      touch: [],
    });
  });

  it("does not add one it already has, and says which to refresh", () => {
    const r = dedupeNotes(existing, [{ kind: "trigger", body: "slips after a late delivery shift." }]);
    expect(r.add).toEqual([]);
    expect(r.touch).toEqual(["a"]);
  });

  it("treats the same note under another kind as known", () => {
    const r = dedupeNotes(existing, [{ kind: "said", body: "Wants to finish his degree" }]);
    expect(r.add).toEqual([]);
    expect(r.touch).toEqual(["b"]);
  });

  it("drops a repeat inside the same batch, and keeps at most two", () => {
    const r = dedupeNotes([], [
      { kind: "why", body: "Wants a life his mom does not worry about" },
      { kind: "said", body: "Wants a life his mom does not worry about." },
      { kind: "trigger", body: "Money pressure at the start of the month" },
      { kind: "working_on", body: "Getting to bed by 11 every night" },
    ]);
    expect(r.add.map((n) => n.kind)).toEqual(["why", "trigger"]);
  });

  it("skips notes that are not usable", () => {
    expect(dedupeNotes(existing, [{ kind: "why", body: "x" }, { kind: "nope" as never, body: "A long enough note" }])).toEqual({ add: [], touch: [] });
  });
});

describe("keeping the profile small", () => {
  it("drops the oldest of a kind past the cap", () => {
    const rows = Array.from({ length: MAX_PER_KIND + 2 }, (_, i) => stored(`w${i}`, "said", `Something said number ${i}`, `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`));
    expect(overflow(rows).sort()).toEqual(["w0", "w1"]);
    expect(overflow(rows.slice(2))).toEqual([]);
  });

  it("puts the why first and the newest first within a kind", () => {
    const lines = profileLines([
      stored("1", "trigger", "Old trigger", "2026-09-01T00:00:00.000Z"),
      stored("2", "why", "The why"),
      stored("3", "trigger", "New trigger", "2026-10-05T00:00:00.000Z"),
    ]);
    expect(lines.map((l) => l.body)).toEqual(["The why", "New trigger", "Old trigger"]);
  });
});

describe("asking a model for notes", () => {
  it("shows the message, a little of the talk and what is already known, with no dash", () => {
    const p = extractPrompt("I only quit lifting when I am alone at night, which is when I slip", [{ sender: "coach", body: "What set it off?" }], [{ kind: "why", body: "Finish my degree" }]);
    expect(p.user).toContain("only quit lifting when I am alone");
    expect(p.user).toContain("Coach: What set it off?");
    expect(p.user).toContain("why: Finish my degree");
    expect(p.system).toContain("at most two");
    expect(p.system + p.user).not.toMatch(DASHES);
  });

  it("reads a clean list, with text around it", () => {
    expect(parseNotes('[{"kind":"trigger","body":"Slips when alone at night"}]')).toEqual([{ kind: "trigger", body: "Slips when alone at night" }]);
    expect(parseNotes('Sure:\n```json\n[{"kind":"why","body":"Wants to finish his degree"}]\n```')).toHaveLength(1);
  });

  it("gives nothing for [], for broken JSON, for the wrong shape or for bad kinds", () => {
    expect(parseNotes("[]")).toEqual([]);
    expect(parseNotes("not json")).toEqual([]);
    expect(parseNotes('[{"kind":"why"')).toEqual([]);
    expect(parseNotes('{"kind":"why","body":"Wants to finish"}')).toEqual([]);
    expect(parseNotes('[{"kind":"mood","body":"Feels low today"}, 4, null]')).toEqual([]);
  });

  it("keeps at most two and cleans each", () => {
    const raw = JSON.stringify([
      { kind: "why", body: "Wants out of debt \u2014 for good" },
      { kind: "trigger", body: "Slips on payday" },
      { kind: "said", body: "A third thing that should not make it" },
    ]);
    const out = parseNotes(raw);
    expect(out).toHaveLength(2);
    expect(out[0].body).toBe("Wants out of debt, for good");
  });
});
