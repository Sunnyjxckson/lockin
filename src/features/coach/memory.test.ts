import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, setBackend } from "@/lib/db";
import { updateSettings } from "@/lib/db/helpers";
import { LocalBackend, memoryStore } from "@/lib/db/local";
import type { Backend } from "@/lib/db/types";
import { nyInstant } from "@/lib/logic/dates";
import { ensureSeeded } from "@/lib/seed";
import { syncCheckins, sendMessage } from "./chat";
import { answerCommitment, askedCommitment, loadCommitments, loadMoods, loadProfile, logMood, saveCommitment, saveProfileNotes, setMoodNote } from "./memory";

const DASHES = /[\u2012-\u2015\u2212]/;
const TODAY = "2026-10-07";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(nyInstant(TODAY, "14:00"));
  setBackend(new LocalBackend(memoryStore(), "local"));
});

afterEach(() => {
  vi.useRealTimers();
  setBackend(null);
});

describe("the profile", () => {
  it("saves a note once and refreshes it when it is said again", async () => {
    await saveProfileNotes([{ kind: "trigger", body: "Slips after a late delivery shift" }]);
    await saveProfileNotes([{ kind: "trigger", body: "slips after a late delivery shift." }]);
    const rows = await loadProfile();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "trigger", body: "Slips after a late delivery shift" });
  });

  it("keeps at most two a time, cleans them, and ignores junk", async () => {
    await saveProfileNotes("nope");
    await saveProfileNotes([{ kind: "bogus", body: "Whatever it is" }, null]);
    expect(await loadProfile()).toEqual([]);
    await saveProfileNotes([
      { kind: "why", body: "Wants out of debt \u2014 for good" },
      { kind: "working_on", body: "Getting to bed by eleven" },
      { kind: "said", body: "A third one that is dropped" },
    ]);
    const rows = await loadProfile();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.body).join(" ")).not.toMatch(DASHES);
  });

  it("is empty, and does not throw, when the table cannot be read or written", async () => {
    const broken = new Proxy(new LocalBackend(memoryStore(), "local"), {
      get(target, prop, receiver) {
        if (prop === "list" || prop === "insert" || prop === "update") {
          return async (table: string, ...rest: unknown[]) => {
            if (table === "coach_profile" || table === "coach_commitment" || table === "mood_log") throw new Error('Could not find the table \'public.coach_profile\' in the schema cache');
            return (target as unknown as Record<string, (...a: unknown[]) => unknown>)[prop as string](table, ...rest);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Backend;
    setBackend(broken);
    expect(await loadProfile()).toEqual([]);
    expect(await loadCommitments()).toEqual([]);
    expect(await loadMoods(TODAY)).toEqual([]);
    await expect(saveProfileNotes([{ kind: "why", body: "Wants out of debt for good" }])).resolves.toBeUndefined();
    await expect(saveCommitment({ body: "lifting", made_on: TODAY, due_at: nyInstant(TODAY, "18:30").toISOString(), due_date: TODAY, due_time: "18:30" })).resolves.toBeUndefined();
  });
});

describe("mood", () => {
  it("logs a mood with the time, then a note on it", async () => {
    const row = await logMood(3, "");
    expect(row).toMatchObject({ date: TODAY, time: "14:00", mood: 3, note: null });
    await setMoodNote(row.id, "  slept badly ");
    expect((await loadMoods(TODAY))[0]).toMatchObject({ mood: 3, note: "slept badly" });
    expect((await logMood(9, "")).mood).toBe(5);
  });
});

describe("commitments", () => {
  it("answers one by tap and the coach replies in the chat", async () => {
    await saveCommitment({ body: "lifting", made_on: TODAY, due_at: nyInstant(TODAY, "13:00").toISOString(), due_date: TODAY, due_time: "13:00" });
    const [c] = await loadCommitments();
    await answerCommitment(c.id, "missed", "stoic");
    expect((await loadCommitments())[0].status).toBe("missed");
    const messages = await db.list("coach_message");
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toContain("What got in the way");
    // Answering twice does nothing.
    await answerCommitment(c.id, "done", "stoic");
    expect((await loadCommitments())[0].status).toBe("missed");
    expect(await db.list("coach_message")).toHaveLength(1);
  });
});

describe("the check-ins the coach sends by itself", () => {
  async function seeded() {
    await ensureSeeded(TODAY);
    // Out of quiet hours and past the history start, whatever the seed chose.
    await updateSettings({ history_start: "2026-09-01", coach_checkins: { post_workout: false, slip: false, missed_item: false, commitment: true, drift: false } });
  }

  it("asks after a commitment once it is due, and only once", async () => {
    await seeded();
    await saveCommitment({ body: "lifting", made_on: TODAY, due_at: nyInstant(TODAY, "13:00").toISOString(), due_date: TODAY, due_time: "13:00" });
    await syncCheckins(TODAY);
    const sent = (await db.list("coach_message")).filter((m) => m.check_key?.startsWith("commit:"));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ trigger: "commitment", read: false, sender: "coach" });
    expect(sent[0].body).toContain("1:00 PM");
    expect(sent[0].body).toContain("lifting");
    expect(askedCommitment(await loadCommitments())?.id).toBeDefined();
    await syncCheckins(TODAY);
    expect((await db.list("coach_message")).filter((m) => m.check_key?.startsWith("commit:"))).toHaveLength(1);
  });

  it("waits until it is due, and waits out quiet hours", async () => {
    await seeded();
    await saveCommitment({ body: "reading", made_on: TODAY, due_at: nyInstant(TODAY, "14:05").toISOString(), due_date: TODAY, due_time: "14:05" });
    await syncCheckins(TODAY);
    expect(await db.list("coach_message")).toHaveLength(0);
    vi.setSystemTime(nyInstant(TODAY, "23:00"));
    await syncCheckins(TODAY);
    expect((await db.list("coach_message")).filter((m) => m.check_key?.startsWith("commit:"))).toHaveLength(0);
    vi.setSystemTime(nyInstant("2026-10-08", "08:00"));
    await syncCheckins("2026-10-08");
    expect((await db.list("coach_message")).filter((m) => m.check_key?.startsWith("commit:"))).toHaveLength(1);
  });

  it("is turned off by the setting", async () => {
    await seeded();
    await updateSettings({ coach_checkins: { post_workout: false, slip: false, missed_item: false, commitment: false, drift: false } });
    await saveCommitment({ body: "lifting", made_on: TODAY, due_at: nyInstant(TODAY, "13:00").toISOString(), due_date: TODAY, due_time: "13:00" });
    expect(await syncCheckins(TODAY)).toBe(0);
    expect(await db.list("coach_message")).toHaveLength(0);
  });

  it("reaches out when they drift, once a day, and gets more direct", async () => {
    await seeded();
    await updateSettings({ coach_checkins: { post_workout: false, slip: false, missed_item: false, commitment: false, drift: true } });
    const item = (await db.list("checklist_item", { eq: { key: "workout" } }))[0];
    await db.insert("day_log", { date: "2026-10-01", item_id: item.id, value: null, checked: true, text: null, completed_at: null, slips: 0 });
    await syncCheckins(TODAY);
    const first = (await db.list("coach_message")).filter((m) => m.check_key?.startsWith("drift:"));
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ trigger: "drift", read: false });
    expect(first[0].body).toContain("days with nothing logged");
    // Not twice on the same day.
    await syncCheckins(TODAY);
    expect((await db.list("coach_message")).filter((m) => m.check_key?.startsWith("drift:"))).toHaveLength(1);
    // Off with the setting.
    await updateSettings({ coach_checkins: { post_workout: false, slip: false, missed_item: false, commitment: false, drift: false } });
    vi.setSystemTime(nyInstant("2026-10-08", "14:00"));
    expect(await syncCheckins("2026-10-08")).toBe(0);
  });

  it("saves a commitment or drift check-in as a plain chat message when migration 0016 has not been run", async () => {
    const local = new LocalBackend(memoryStore(), "local");
    const refusing = new Proxy(local, {
      get(target, prop, receiver) {
        if (prop === "insert") {
          return async (table: string, row: { trigger?: string }) => {
            if (table === "coach_message" && (row.trigger === "commitment" || row.trigger === "drift")) throw new Error('new row for relation "coach_message" violates check constraint "coach_message_trigger_check"');
            return target.insert(table as "coach_message", row as never);
          };
        }
        const v = Reflect.get(target, prop, receiver);
        return typeof v === "function" ? v.bind(target) : v;
      },
    }) as Backend;
    setBackend(refusing);
    await ensureSeeded(TODAY);
    await updateSettings({ history_start: "2026-09-01" });
    await saveCommitment({ body: "lifting", made_on: TODAY, due_at: nyInstant(TODAY, "13:00").toISOString(), due_date: TODAY, due_time: "13:00" });
    await syncCheckins(TODAY);
    const sent = (await db.list("coach_message")).filter((m) => m.check_key?.startsWith("commit:"));
    expect(sent).toHaveLength(1);
    expect(sent[0].trigger).toBe("chat");
  });
});

describe("sending a message", () => {
  it("saves what they said they would do, and the reply never fails because a table is missing", async () => {
    await ensureSeeded(TODAY);
    await updateSettings({ history_start: "2026-09-01" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await sendMessage("I'm gonna lift at 6:30");
    const [c] = await loadCommitments();
    expect(c).toMatchObject({ body: "lift", status: "open" });
    expect(c.due_at).toBe(nyInstant(TODAY, "18:30").toISOString());
    const messages = await db.list("coach_message", { orderBy: "sent_at" });
    expect(messages.map((m) => m.sender)).toEqual(["me", "coach"]);
    vi.unstubAllGlobals();
  });

  it("marks the commitment it asked about from the reply, and does not save a new one from a heavy message", async () => {
    await ensureSeeded(TODAY);
    await updateSettings({ history_start: "2026-09-01" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await saveCommitment({ body: "lifting", made_on: TODAY, due_at: nyInstant(TODAY, "13:00").toISOString(), due_date: TODAY, due_time: "13:00" });
    await syncCheckins(TODAY);
    await sendMessage("no, got stuck at work");
    expect((await loadCommitments())[0].status).toBe("missed");
    await sendMessage("honestly i want to die, i'll do it at 9pm");
    expect(await loadCommitments()).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("writes the support reply by rule when the route is not there", async () => {
    await ensureSeeded(TODAY);
    await updateSettings({ history_start: "2026-09-01" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await sendMessage("rough day");
    const last = (await db.list("coach_message", { orderBy: "sent_at" })).pop();
    expect(last?.body).toContain("You want a push or you want to talk?");
    vi.unstubAllGlobals();
  });
});
