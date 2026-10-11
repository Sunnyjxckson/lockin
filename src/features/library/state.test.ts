import { beforeEach, describe, expect, it } from "vitest";
import { db, setBackend } from "@/lib/db";
import { LocalBackend, memoryStore } from "@/lib/db/local";
import { ensureMarks, currentMarks, markRead, resetMarks, setNote, setSaved } from "./state";

const ref = { id: "seneca-letters-letter-13-a1b2c3", writer: "seneca", work: "letters" };
const other = { id: "seneca-letters-letter-14-d4e5f6", writer: "seneca", work: "shortness-of-life" };

async function settle() {
  // Writes are queued behind each other; one more await gets past the queue.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("the quote marks", () => {
  beforeEach(() => {
    resetMarks();
    setBackend(new LocalBackend(memoryStore(), "local", () => "2026-10-11T12:00:00.000Z"));
  });

  it("marks a quote read once and keeps one row", async () => {
    await ensureMarks();
    expect(await markRead(ref, "2026-10-11T12:00:00.000Z")).toBe(true);
    expect(await markRead(ref, "2026-10-11T13:00:00.000Z")).toBe(false);
    await settle();
    expect(currentMarks().get(ref.id)?.read_at).toBe("2026-10-11T12:00:00.000Z");
    const rows = await db.list("quote_state");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quote_id: ref.id, writer: "seneca", work: "letters", read_at: "2026-10-11T12:00:00.000Z", saved_at: null, note: null });
  });

  it("saves and unsaves, and a note saves the quote", async () => {
    await ensureMarks();
    await setSaved(ref, true, "2026-10-11T12:00:00.000Z");
    await setSaved(ref, false);
    expect(currentMarks().get(ref.id)?.saved_at).toBeNull();
    await setNote(other, "  This one is for the morning.  ", "2026-10-11T14:00:00.000Z");
    expect(currentMarks().get(other.id)).toMatchObject({ note: "This one is for the morning.", saved_at: "2026-10-11T14:00:00.000Z", read_at: null });
    await setNote(other, "");
    expect(currentMarks().get(other.id)?.note).toBeNull();
    await settle();
    const rows = await db.list("quote_state");
    expect(rows.map((r) => r.quote_id).sort()).toEqual([ref.id, other.id]);
    expect(rows.find((r) => r.quote_id === other.id)).toMatchObject({ note: null, saved_at: "2026-10-11T14:00:00.000Z" });
  });

  it("does not write a row for unsaving a quote it has never seen", async () => {
    await ensureMarks();
    await setSaved(ref, false);
    await settle();
    expect(await db.list("quote_state")).toHaveLength(0);
  });
});
