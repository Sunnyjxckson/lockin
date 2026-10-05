import { describe, expect, it } from "vitest";
import type { ChecklistItem, DayLog, Target } from "../types";
import type { ItemResult, ItemState } from "./day";
import { SEED_ITEMS, SEED_VICE_LIBRARY } from "../seed/data";
import { TRACKS, defaultTrack, greeting, greetingLines, orderByTrack, shortHint, shortName, shortTarget, summarizeTracks, trackOf } from "./tracks";

let n = 0;
function item(p: Partial<ChecklistItem>): ChecklistItem {
  n += 1;
  return {
    id: `i${n}`,
    created_at: "2026-10-05T00:00:00Z",
    key: null,
    name: "Item",
    type: "yesno",
    cadence: "daily",
    target: { kind: "check" },
    category: "habit",
    mode: null,
    unit: null,
    hint: null,
    sort_order: n,
    active: true,
    archived: false,
    weekly_day: null,
    with_photo: false,
    tracks_money: false,
    typical_spend: null,
    spend_period: null,
    track: null,
    ...p,
  };
}

function result(i: ChecklistItem, state: ItemState, value: number | null = null, target: Target = i.target): ItemResult {
  const log: DayLog | null = state === "open" && value === null ? null : ({ id: `l${i.id}`, created_at: "", date: "2026-10-08", item_id: i.id, value, checked: state !== "open", text: null, completed_at: null, slips: 0 } as DayLog);
  return { item: i, target, log, state, done: state === "done" };
}

describe("which track an item counts toward", () => {
  it("maps every seeded item, and the day splits 6, 1, 2, 3", () => {
    const by = (key: string) => defaultTrack(SEED_ITEMS.find((i) => i.key === key)!);
    expect(["wake", "workout", "core", "calories", "protein", "bed", "weighin"].map(by)).toEqual(Array(7).fill("body"));
    expect(by("earned")).toBe("money");
    expect(["study", "business", "talk"].map(by)).toEqual(["mind", "mind", "mind"]);
    for (const v of [...SEED_ITEMS.filter((i) => i.category === "vice"), ...SEED_VICE_LIBRARY]) expect(defaultTrack(v), v.name).toBe("clean");
    const daily = SEED_ITEMS.filter((i) => i.cadence === "daily");
    expect(TRACKS.map((t) => daily.filter((i) => defaultTrack(i) === t).length)).toEqual([6, 1, 2, 3]);
  });

  it("places an item the user made by what it measures", () => {
    expect(defaultTrack(item({ name: "Tips", type: "number", unit: "$" }))).toBe("money");
    expect(defaultTrack(item({ name: "Side job", tracks_money: true }))).toBe("money");
    expect(defaultTrack(item({ name: "Water", type: "number", unit: "oz" }))).toBe("body");
    expect(defaultTrack(item({ name: "Read 20 pages" }))).toBe("mind");
    expect(defaultTrack(item({ name: "No soda", category: "vice" }))).toBe("clean");
  });

  it("uses the track set on the item over the default, and ignores one it does not know", () => {
    expect(trackOf(item({ key: "wake", track: "mind" }))).toBe("mind");
    expect(trackOf(item({ key: "wake", track: null }))).toBe("body");
    expect(trackOf(item({ key: "wake", track: "soul" as never }))).toBe("body");
    // A row written before the column existed has no field at all.
    const old = item({ key: "earned" }) as Partial<ChecklistItem>;
    delete old.track;
    expect(trackOf(old as ChecklistItem)).toBe("money");
  });

  it("orders by track and keeps the checklist order inside each", () => {
    const rows = [item({ key: "study", name: "s" }), item({ key: "wake", name: "w" }), item({ category: "vice", name: "v" }), item({ key: "earned", name: "e" }), item({ key: "core", name: "c" })].map((i) => ({ item: i }));
    expect(orderByTrack(rows).map((r) => r.item.name)).toEqual(["w", "c", "e", "s", "v"]);
  });
});

describe("the four tracks", () => {
  const wake = item({ key: "wake" });
  const lift = item({ key: "workout" });
  const earned = item({ key: "earned", type: "number", unit: "$", target: { kind: "min", min: 100 } });
  const study = item({ key: "study" });
  const smoke = item({ key: "vice_smoking", category: "vice", name: "No smoking" });
  const drink = item({ key: "vice_drinking", category: "vice", name: "No drinking" });

  it("counts body and mind, shows dollars for money and days for clean", () => {
    const out = summarizeTracks(
      [result(wake, "done"), result(lift, "open"), result(earned, "off", 40), result(study, "done"), result(smoke, "done"), result(drink, "done")],
      { [smoke.id]: { current: 4 }, [drink.id]: { current: 9 } },
    );
    expect(out.map((t) => [t.label, t.value])).toEqual([
      ["Body", "1/2"],
      ["Money", "$40"],
      ["Mind", "1/1"],
      ["Clean", "4d"],
    ]);
    expect(out[0].progress).toBe(0.5);
    // $40 of $100 is on its way, not a problem.
    expect(out[1].attention).toBe(false);
    expect(out[1].progress).toBeCloseTo(0.4);
    expect(out[3].progress).toBe(1);
  });

  it("fills the money line once the floor is met and never past it", () => {
    expect(summarizeTracks([result(earned, "done", 250)])[0]).toMatchObject({ value: "$250", progress: 1, done: 1 });
    expect(summarizeTracks([result(earned, "open")])[0]).toMatchObject({ value: "$0", progress: 0 });
  });

  it("a slip today makes clean 0d and flags the track", () => {
    const out = summarizeTracks([result(smoke, "off"), result(drink, "done")], { [smoke.id]: { current: 0 }, [drink.id]: { current: 9 } });
    expect(out[0]).toMatchObject({ value: "0d", done: 1, total: 2, attention: true });
  });

  it("leaves out a track with nothing in it, and counts a money track without dollars", () => {
    expect(summarizeTracks([result(wake, "open")]).map((t) => t.track)).toEqual(["body"]);
    const call = item({ name: "Call a client", track: "money" });
    expect(summarizeTracks([result(call, "done")])[0].value).toBe("1/1");
    expect(summarizeTracks([])).toEqual([]);
  });

  it("with more than the dollar item in money, the line counts items", () => {
    const call = item({ name: "Call a client", track: "money" });
    const out = summarizeTracks([result(earned, "off", 40), result(call, "done")])[0];
    expect(out.value).toBe("$40");
    expect(out.progress).toBe(0.5);
  });
});

describe("the greeting", () => {
  it("follows the time of day", () => {
    expect([4, 5, 11].map(greeting)).toEqual(Array(3).fill("Good morning"));
    expect([12, 16].map(greeting)).toEqual(Array(2).fill("Good afternoon"));
    expect([17, 23, 0, 3].map(greeting)).toEqual(Array(4).fill("Good evening"));
  });

  it("breaks before the name and works without one", () => {
    expect(greetingLines(6, "Sunny")).toEqual(["Good morning,", "Sunny."]);
    expect(greetingLines(13, "  ")).toEqual(["Good afternoon."]);
    expect(greetingLines(20, null)).toEqual(["Good evening."]);
  });
});

describe("short names for tiles", () => {
  it("shortens seeded items and takes the No off a vice", () => {
    expect(shortName({ key: "study", name: "Study or homework block", category: "habit" })).toBe("Study");
    expect(shortName({ key: "vice_smoking", name: "No smoking", category: "vice" })).toBe("Smoking");
    expect(shortName({ key: "vice_gambling", name: "No gambling or sports betting", category: "vice" })).toBe("Gambling or sports betting");
    expect(shortName({ key: null, name: "Read 20 pages", category: "habit" })).toBe("Read 20 pages");
  });
});

describe("the small line of a tile", () => {
  it("keeps a short note and swaps a long one on a seeded item", () => {
    expect(shortHint({ key: "core", hint: "5 to 10 min" })).toBe("5 to 10 min");
    expect(shortHint({ key: "study", hint: "Scheduled block completed" })).toBe("Block done");
    expect(shortHint({ key: null, hint: "A note far too long for a tile" })).toBe("");
    expect(shortHint({ key: null, hint: null })).toBe("");
  });

  it("writes a number target in a few characters", () => {
    expect(shortTarget({ kind: "min", min: 100 }, "$")).toBe("of $100");
    expect(shortTarget({ kind: "min", min: 180 }, "g")).toBe("180g or more");
    expect(shortTarget({ kind: "range", min: 1900, max: 2100 }, "kcal")).toBe("1,900 to 2,100");
    expect(shortTarget({ kind: "max", max: 2 }, null)).toBe("2 or less");
    expect(shortTarget({ kind: "min", min: 60 }, "min")).toBe("60 or more");
    expect(shortTarget({ kind: "check" })).toBe("");
  });
});
