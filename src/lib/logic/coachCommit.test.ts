import { describe, expect, it } from "vitest";
import type { CoachCommitment } from "../types";
import { ASK_AFTER_MIN, STALE_HOURS, commitmentAnswer, commitmentAsk, commitmentLines, commitmentReply, commitmentSteps, parseCommitment, type CommitContext } from "./coachCommit";
import { nyInstant, nyParts } from "./dates";

const DASHES = /[\u2012-\u2015\u2212]/;
const TODAY = "2026-10-07"; // a Wednesday

function at(time: string, blocks: CommitContext["blocks"] = []): CommitContext {
  return { date: TODAY, time, blocks };
}

const BLOCKS = [
  { block_name: "Workout + core", start: "06:30", end: "07:30", kind: "workout" },
  { block_name: "Class", start: "09:30", end: "16:00", kind: "class" },
  { block_name: "Delivery", start: "17:00", end: "21:00", kind: "delivery" },
];

/** The due time as New York wall clock. */
function when(iso: string): string {
  const p = nyParts(iso);
  return `${p.date} ${p.time}`;
}

describe("parseCommitment", () => {
  it("reads 'lifting at 6:30' as the next 6:30", () => {
    const morning = parseCommitment("lifting at 6:30", at("05:00"));
    expect(morning && when(morning.due_at)).toBe(`${TODAY} 06:30`);
    expect(morning?.body).toBe("lifting");
    // Said at 4 PM, the 6:30 that has not passed is the evening one.
    const evening = parseCommitment("lifting at 6:30", at("16:00"));
    expect(evening && when(evening.due_at)).toBe(`${TODAY} 18:30`);
    // Said at 10 PM, both have passed: it is tomorrow morning.
    const late = parseCommitment("lifting at 6:30", at("22:00"));
    expect(late && when(late.due_at)).toBe("2026-10-08 06:30");
  });

  it("reads I will, I'm gonna and I'll with a time", () => {
    for (const text of ["I will study at 7pm", "I'm gonna study at 7pm", "im gonna study at 7 pm", "I'll study at 19:00"]) {
      const c = parseCommitment(text, at("14:00"));
      expect(c && when(c.due_at), text).toBe(`${TODAY} 19:00`);
      expect(c?.body, text).toBe("study");
    }
  });

  it("keeps the action and drops the time and the 'I will'", () => {
    expect(parseCommitment("I'm going to call my mom at 5:15 pm", at("12:00"))?.body).toBe("call my mom");
    expect(parseCommitment("ok I will do the reading tonight", at("14:00"))?.body).toBe("do the reading");
  });

  it("reads tonight, in an hour and tomorrow", () => {
    const tonight = parseCommitment("I will finish the paper tonight", at("14:00"));
    expect(tonight && when(tonight.due_at)).toBe(`${TODAY} 20:00`);
    const soon = parseCommitment("I'm gonna go for a run in 2 hours", at("14:10"));
    expect(soon && when(soon.due_at)).toBe(`${TODAY} 16:10`);
    const half = parseCommitment("I'll stretch in half an hour", at("14:00"));
    expect(half && when(half.due_at)).toBe(`${TODAY} 14:30`);
    const tomorrow = parseCommitment("gonna lift tomorrow at 6:30", at("14:00"));
    expect(tomorrow && when(tomorrow.due_at)).toBe("2026-10-08 06:30");
    const morning = parseCommitment("I will study tomorrow morning", at("14:00"));
    expect(morning && when(morning.due_at)).toBe("2026-10-08 08:00");
  });

  it("reads 'after class' from the schedule", () => {
    const c = parseCommitment("studying after class", at("11:00", BLOCKS));
    expect(c && when(c.due_at)).toBe(`${TODAY} 16:00`);
    expect(c?.body).toBe("studying");
    // The block is over already: two hours from now.
    const late = parseCommitment("I'm gonna study after class", at("17:30", BLOCKS));
    expect(late && when(late.due_at)).toBe(`${TODAY} 19:30`);
    // No class on the schedule: two hours from now too.
    const none = parseCommitment("I will study after class", at("10:00"));
    expect(none && when(none.due_at)).toBe(`${TODAY} 12:00`);
  });

  it("needs a time, and ignores numbers that are not one", () => {
    expect(parseCommitment("I'm gonna lift", at("10:00"))).toBeNull();
    expect(parseCommitment("I will do 3 sets of squats", at("10:00"))).toBeNull();
    expect(parseCommitment("I'm gonna eat 2 eggs", at("10:00"))).toBeNull();
  });

  it("does not take a question, a denial, the past or a plan to give up", () => {
    for (const text of [
      "should I lift at 6:30?",
      "I'm not gonna lift at 6:30",
      "I won't study tonight",
      "I was going to lift at 6:30 yesterday",
      "I'm gonna skip the gym at 6:30",
      "I might quit lifting at 6",
      "I did lift at 6:30",
    ]) {
      expect(parseCommitment(text, at("05:00")), text).toBeNull();
    }
  });

  it("does not save a promise to use a vice", () => {
    expect(parseCommitment("I'm gonna smoke at 8", at("14:00"))).toBeNull();
    expect(parseCommitment("I'll have a drink tonight", at("14:00"))).toBeNull();
  });

  it("takes the first sentence that is a promise", () => {
    const c = parseCommitment("Rough morning. I will study at 3pm. Then I'll eat.", at("10:00"));
    expect(c && when(c.due_at)).toBe(`${TODAY} 15:00`);
  });

  it("does not set a time that has passed today to the same day", () => {
    const c = parseCommitment("I will call him at 9am", at("13:00"));
    expect(c && when(c.due_at)).toBe("2026-10-08 09:00");
  });

  it("returns the instant in New York time", () => {
    const c = parseCommitment("I will study at 7pm", at("14:00"));
    expect(c?.due_at).toBe(nyInstant(TODAY, "19:00").toISOString());
    expect(c?.made_on).toBe(TODAY);
  });
});

function row(over: Partial<CoachCommitment> & { due: string }): CoachCommitment {
  const { due, ...rest } = over;
  return { id: "c1", created_at: "2026-10-07T10:00:00.000Z", body: "lifting", made_on: TODAY, due_at: nyInstant(TODAY, due).toISOString(), status: "open", asked_at: null, ...rest };
}

describe("asking after a commitment", () => {
  const now = (time: string, date = TODAY) => nyInstant(date, time);

  it("asks ten minutes after it was due, not before", () => {
    expect(ASK_AFTER_MIN).toBe(10);
    expect(commitmentSteps([row({ due: "18:30" })], now("18:35"))).toEqual([]);
    expect(commitmentSteps([row({ due: "18:30" })], now("18:40"))).toEqual([{ id: "c1", action: "ask" }]);
  });

  it("leaves alone one that was asked, answered or dropped", () => {
    expect(commitmentSteps([row({ due: "18:30", asked_at: "2026-10-07T22:45:00.000Z" })], now("19:30"))).toEqual([]);
    expect(commitmentSteps([row({ due: "18:30", status: "done" })], now("19:30"))).toEqual([]);
    expect(commitmentSteps([row({ due: "18:30", status: "dropped" })], now("19:30"))).toEqual([]);
  });

  it("lets go of one that is too old to ask about", () => {
    expect(STALE_HOURS).toBe(36);
    expect(commitmentSteps([row({ due: "18:30" })], now("12:00", "2026-10-09"))).toEqual([{ id: "c1", action: "drop" }]);
  });

  it("words the question in the three voices, with the time and the action", () => {
    const c = row({ due: "18:30" });
    const bodies = (["stoic", "sergeant", "brother"] as const).map((v) => commitmentAsk(c, TODAY, v));
    expect(new Set(bodies).size).toBe(3);
    for (const b of bodies) {
      expect(b).toContain("6:30 PM");
      expect(b).toContain("lifting");
      expect(b).not.toMatch(DASHES);
    }
    expect(commitmentAsk(c, "2026-10-08", "stoic")).toContain("yesterday at 6:30 PM");
  });
});

describe("the answer", () => {
  it("reads yes and no, and lets 'didn't' win over 'did'", () => {
    expect(commitmentAnswer("yeah did it")).toBe("done");
    expect(commitmentAnswer("Done, crushed it")).toBe("done");
    expect(commitmentAnswer("no, got stuck at work")).toBe("missed");
    expect(commitmentAnswer("I didn't get to it")).toBe("missed");
    expect(commitmentAnswer("i did not do it")).toBe("missed");
    expect(commitmentAnswer("what time is it")).toBeNull();
  });

  it("answers a miss with no shame and a way forward, and a win with a line", () => {
    for (const v of ["stoic", "sergeant", "brother"] as const) {
      const missed = commitmentReply("missed", v);
      expect(missed).toContain("What got in the way");
      expect(missed).not.toMatch(/fail|lazy|weak|disappoint/i);
      expect(commitmentReply("done", v)).not.toBe(missed);
      expect(missed + commitmentReply("done", v)).not.toMatch(DASHES);
    }
  });
});

describe("commitments in the coach's context", () => {
  it("lists open and recent ones, newest first, and marks the unanswered one that is due", () => {
    const now = nyInstant(TODAY, "19:00");
    const lines = commitmentLines(
      [row({ id: "a", due: "18:30", body: "lifting" }), row({ id: "b", due: "21:00", body: "reading" }), row({ id: "c", due: "08:00", body: "run", status: "done" }), row({ id: "d", due: "07:00", body: "old", status: "dropped" })],
      TODAY,
      now,
    );
    expect(lines.map((l) => l.what)).toEqual(["reading", "lifting", "run"]);
    expect(lines[0]).toMatchObject({ when: "today 9:00 PM", status: "open", waiting: false });
    expect(lines[1]).toMatchObject({ waiting: true });
  });
});
