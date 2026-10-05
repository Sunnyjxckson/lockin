// The four tracks Today sums the day up in: Body, Money, Mind, Clean. Pure
// functions, no db.
//
// Every checklist item counts toward one track. An item can carry its own
// (`item.track`, set in Settings). Without one it gets a default: seeded items
// by key, vices to Clean, and anything else by what it measures.

import type { ChecklistItem, Target, Track } from "../types";
import type { ItemResult } from "./day";
import { formatMoney } from "./money";

export const TRACKS: readonly Track[] = ["body", "money", "mind", "clean"];

export const TRACK_LABEL: Record<Track, string> = { body: "Body", money: "Money", mind: "Mind", clean: "Clean" };

const BY_KEY: Record<string, Track> = {
  wake: "body",
  workout: "body",
  core: "body",
  calories: "body",
  protein: "body",
  bed: "body",
  weighin: "body",
  earned: "money",
  study: "mind",
  business: "mind",
  talk: "mind",
};

const BODY_UNITS = new Set(["kcal", "cal", "g", "lb", "lbs", "kg", "oz", "steps", "mi", "km", "reps"]);

export function isTrack(v: unknown): v is Track {
  return v === "body" || v === "money" || v === "mind" || v === "clean";
}

type Trackable = Pick<ChecklistItem, "key" | "category" | "unit" | "tracks_money"> & { track?: Track | null };

/** The track an item gets when none is set on it. */
export function defaultTrack(item: Trackable): Track {
  if (item.category === "vice") return "clean";
  if (item.key && BY_KEY[item.key]) return BY_KEY[item.key];
  const unit = (item.unit ?? "").trim().toLowerCase();
  if (unit === "$" || item.tracks_money) return "money";
  if (BODY_UNITS.has(unit)) return "body";
  return "mind";
}

/** The track an item counts toward: its own when set, otherwise the default. */
export function trackOf(item: Trackable): Track {
  return isTrack(item.track) ? item.track : defaultTrack(item);
}

/** Items grouped by track, Body first, each group in its checklist order. */
export function orderByTrack<T extends { item: Trackable }>(rows: readonly T[]): T[] {
  return TRACKS.flatMap((t) => rows.filter((r) => trackOf(r.item) === t));
}

export interface TrackSummary {
  track: Track;
  label: string;
  done: number;
  total: number;
  /** What the track shows as its number: "3/6", "$40", "4d". */
  value: string;
  /** 0 to 1, for the line under the number. */
  progress: number;
  /** Something in the track is logged and does not count: a slip, a late check, a number outside its range. */
  attention: boolean;
}

/** Logged and it does not count: a slip, a late check, a number over its limit. A number that is only not there yet is not this. */
function needsLook(r: ItemResult): boolean {
  if (r.state !== "off") return false;
  if (r.item.type !== "number") return true;
  if ((r.log?.slips ?? 0) > 0) return true;
  const max = r.target.kind === "max" || r.target.kind === "range" ? r.target.max : null;
  return max !== null && (r.log?.value ?? 0) > max;
}

function moneyProgress(target: Target, value: number): number {
  if (target.kind === "min") return target.min > 0 ? Math.min(1, value / target.min) : 1;
  if (target.kind === "range") return target.min > 0 ? Math.min(1, value / target.min) : 1;
  return 0;
}

/**
 * One summary per track that has items today, in track order.
 *
 * - Money shows dollars when it holds a dollar item (earned so far against
 *   the floor), since "0/1" says less than "$40".
 * - Clean shows days in a row with every vice clean, which is the number
 *   that matters there. A slip today makes it 0d.
 * - Everything else shows done over total.
 *
 * `streaks` is the current streak per item id, today included when done.
 */
export function summarizeTracks(results: readonly ItemResult[], streaks: Readonly<Record<string, { current: number } | undefined>> = {}): TrackSummary[] {
  const out: TrackSummary[] = [];
  for (const track of TRACKS) {
    const rows = results.filter((r) => trackOf(r.item) === track);
    if (rows.length === 0) continue;
    const done = rows.filter((r) => r.done).length;
    const total = rows.length;
    let value = `${done}/${total}`;
    let progress = done / total;
    if (track === "money") {
      const dollars = rows.find((r) => r.item.key === "earned") ?? rows.find((r) => r.item.type === "number" && r.item.unit === "$");
      if (dollars) {
        const v = dollars.log?.value ?? 0;
        value = formatMoney(Math.round(v));
        // One dollar item is the track. With more items the line still counts all of them.
        progress = total === 1 ? (dollars.done ? 1 : moneyProgress(dollars.target, v)) : done / total;
      }
    }
    if (track === "clean") {
      const days = Math.min(...rows.map((r) => (r.state === "off" ? 0 : (streaks[r.item.id]?.current ?? 0))));
      value = `${Number.isFinite(days) ? days : 0}d`;
    }
    out.push({ track, label: TRACK_LABEL[track], done, total, value, progress, attention: rows.some(needsLook) });
  }
  return out;
}

// ---------- the greeting ----------

/** "Good morning" from 4:00, "Good afternoon" from noon, "Good evening" from 5:00 PM. */
export function greeting(hour: number): string {
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The two lines of the greeting: ["Good morning,", "Sunny."], or ["Good morning."] without a name. */
export function greetingLines(hour: number, name?: string | null): string[] {
  const who = (name ?? "").trim();
  return who ? [`${greeting(hour)},`, `${who}.`] : [`${greeting(hour)}.`];
}

// ---------- short names for tiles ----------

const SHORT: Record<string, string> = {
  wake: "Wake",
  workout: "Workout",
  core: "Core",
  calories: "Calories",
  protein: "Protein",
  earned: "Earned",
  study: "Study",
  business: "Business",
  bed: "Bed",
  talk: "Talk",
  weighin: "Weigh-in",
};

/** A name short enough for a tile: seeded items by key, a vice without its "No", anything else as it is. */
export function shortName(item: Pick<ChecklistItem, "key" | "name" | "category">): string {
  if (item.key && SHORT[item.key]) return SHORT[item.key];
  if (item.category === "vice") {
    const bare = item.name.replace(/^no\s+/i, "").trim();
    return bare ? bare.charAt(0).toUpperCase() + bare.slice(1) : item.name;
  }
  return item.name;
}

const HINT: Record<string, string> = {
  study: "Block done",
  business: "One move",
  bed: "On time",
  talk: "This week",
  core: "5 to 10 min",
};

/** The small line of a tile when nothing better is known: the item's own note when it is short, a short one for seeded items otherwise. */
export function shortHint(item: Pick<ChecklistItem, "key" | "hint">): string {
  const own = (item.hint ?? "").trim();
  if (own && own.length <= 12) return own;
  return (item.key && HINT[item.key]) || "";
}

/** A number target short enough for a tile: "of $100", "180g or more", "1,900 to 2,100", "2 or less". */
export function shortTarget(target: Target, unit: string | null = null): string {
  const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const u = (v: number) => (unit === "$" ? `$${n(v)}` : `${n(v)}${unit && unit.length <= 2 ? unit : ""}`);
  switch (target.kind) {
    case "min":
      return unit === "$" ? `of ${u(target.min)}` : `${u(target.min)} or more`;
    case "max":
      return `${u(target.max)} or less`;
    case "range":
      return `${n(target.min)} to ${n(target.max)}`;
    default:
      return "";
  }
}
