// Data upgrades for rows written by an earlier build. In Supabase mode the SQL
// migrations do this work, so this only runs against the device store.
// Every step is safe to run again and does nothing once the data is current.

import { db } from "./index";
import { syncSlipCount } from "./helpers";
import { todayNY, nyParts } from "../logic/dates";
import { STAPLES } from "../logic/mealsFoods";
import { parseLegacySpendHint } from "../logic/vices";
import { getPref, setPref } from "../prefs";
import type { AppSettings, BoardItem, Challenge, DateStr, FocusSession } from "../types";

/** The Monday of the reserved meal_plan row that used to hold the pantry, receipt prices and preferred store. */
const BOOK_WEEK: DateStr = "2000-01-03";

/** Fill in fields a row was written without. Fields that are there are never changed. */
function missing<T extends object>(row: T, defaults: Partial<T>): Partial<T> | null {
  const patch: Partial<T> = {};
  let any = false;
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    if (row[key] === undefined) {
      patch[key] = defaults[key];
      any = true;
    }
  }
  return any ? patch : null;
}

export async function upgradeLocalData(): Promise<void> {
  if ((await db.backendName()) !== "local") return;

  // 0003: the typical spend moves out of checklist_item.hint into its own fields.
  const items = await db.list("checklist_item");
  for (const item of items) {
    const legacy = parseLegacySpendHint(item.hint);
    if (legacy) {
      await db.update("checklist_item", item.id, { typical_spend: legacy.amount, spend_period: legacy.period, hint: null });
    } else if (item.typical_spend === undefined || item.spend_period === undefined) {
      await db.update("checklist_item", item.id, { typical_spend: item.typical_spend ?? null, spend_period: item.spend_period ?? null });
    }
    // 0013: the track needs no step here. A row without the field counts toward its default (trackOf in logic/tracks).
  }

  // 0004: day_log carries the slip count.
  const slips = await db.list("vice_slip");
  const seen = new Set<string>();
  for (const s of slips) {
    const key = `${s.item_id}|${s.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await syncSlipCount(s.item_id, s.date);
  }

  // 0005: the money target start. Null means the challenge start.
  // 0007: one fixed challenge row becomes one row per challenge. The row that
  // is there becomes the first, active challenge and keeps its id, dates and
  // money target. Logs were always keyed by date, so none of them move.
  const challenges = await db.list("challenge", { orderBy: "created_at" });
  let hasActive = challenges.some((c) => c.status === "active");
  for (const c of challenges) {
    const first = !hasActive && c.status === undefined;
    if (first) hasActive = true;
    const patch = missing<Challenge>(c, {
      money_target_start: null,
      name: "30 day lock in",
      status: first ? "active" : "ended",
      ended_on: null,
      rules: null,
      restart_of: null,
    });
    if (patch) await db.update("challenge", c.id, patch);
  }

  // 0007 and 0008: the ongoing history start, the live daily floor, and the
  // food and focus settings.
  const settings = await db.get("app_settings", "app");
  if (settings) {
    let patch: Partial<AppSettings> | null = null;
    if (settings.history_start === undefined || settings.daily_floor === undefined) {
      const [firstLog, firstEarning, earned] = await Promise.all([
        db.first("day_log", { orderBy: "date" }),
        db.first("earning", { orderBy: "date" }),
        db.first("checklist_item", { eq: { key: "earned" } }),
      ]);
      const installed = settings.created_at ? nyParts(settings.created_at).date : todayNY();
      const dates: DateStr[] = [installed, ...challenges.map((c) => c.start_date), ...(firstLog ? [firstLog.date] : []), ...(firstEarning ? [firstEarning.date] : [])];
      const oldest = dates.filter(Boolean).sort()[0];
      const floor = challenges[0]?.daily_floor ?? (earned?.target.kind === "min" ? earned.target.min : 100);
      patch = missing<AppSettings>(settings, { history_start: oldest, daily_floor: floor });
    }
    // 0013: the name Today greets, the same default the SQL migration and the seed give.
    const rest = missing<AppSettings>(settings, { weekly_food_budget: null, food_likes: [], food_dislikes: [], focus_goal_minutes: 60, business_goal: null, display_name: "Sunny" });
    if (patch || rest) await db.update("app_settings", "app", { ...patch, ...rest });
  }

  // 0009: focus sessions carry their away numbers and the running state.
  for (const row of await db.list("focus_session")) {
    const patch = missing<FocusSession>(row, { away_count: 0, away_minutes: 0, clock_minutes: null, planned_minutes: null, completed: false, live: null });
    if (patch) await db.update("focus_session", row.id, patch);
  }

  // 0010: board images carry their shape.
  for (const row of await db.list("board_item")) {
    const patch = missing<BoardItem>(row, { aspect: null });
    if (patch) await db.update("board_item", row.id, patch);
  }

  // 0011: the pantry, receipt prices and preferred store leave the reserved
  // meal_plan row for their own tables. preferred_store being absent is the
  // mark that this has not run yet.
  if (settings && settings.preferred_store === undefined) {
    const book = await db.first("meal_plan", { eq: { week_start: BOOK_WEEK } });
    if (book) {
      const rows = await db.list("grocery_item", { eq: { plan_id: book.id } });
      const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
      for (const r of rows) {
        if (r.category === "@pantry") await db.upsert("pantry_item", { name: key(r.name) }, ["name"]);
        if (r.category === "@price") {
          for (const [store, price] of Object.entries(r.prices ?? {})) {
            if (typeof price === "number" && price >= 0) await db.upsert("receipt_price", { name: key(r.name), store, price }, ["name", "store"]);
          }
        }
      }
      await db.removeWhere("grocery_item", { plan_id: book.id });
      await db.remove("meal_plan", book.id);
    } else if ((await db.list("pantry_item", { limit: 1 })).length === 0) {
      // Meals was never opened: the staples count as at home, as on a new install.
      await db.insertMany("pantry_item", STAPLES.map((name) => ({ name })));
    }
    await db.update("app_settings", "app", { preferred_store: book?.store ?? null });
  }
}

type PrefReader = (key: string) => string | null;
type PrefWriter = (key: string, value: string | null) => void;

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Things an earlier build kept per device because their columns did not
 * exist yet: a finished focus session's away numbers, the business goal, and
 * the shape of each board image. They move into the tables once and the
 * device copies are removed. Runs in every mode, since the device copies were
 * written in every mode. Safe to run again.
 */
export async function adoptDevicePrefs(read: PrefReader = getPref, write: PrefWriter = setPref): Promise<void> {
  const meta = parse<Record<string, { clock_minutes?: number; away_count?: number; away_minutes?: number; planned_minutes?: number | null; completed?: boolean }>>(read("focus:meta"));
  if (meta) {
    for (const [id, m] of Object.entries(meta)) {
      const row = await db.get("focus_session", id);
      if (!row || row.end === null) continue;
      await db.update("focus_session", id, {
        away_count: Number(m.away_count) || 0,
        away_minutes: Number(m.away_minutes) || 0,
        clock_minutes: typeof m.clock_minutes === "number" ? m.clock_minutes : null,
        planned_minutes: typeof m.planned_minutes === "number" ? m.planned_minutes : null,
        completed: m.completed === true,
      });
    }
    write("focus:meta", null);
  }

  const goal = read("focus:business_goal");
  if (goal !== null) {
    const settings = await db.get("app_settings", "app");
    if (settings && !settings.business_goal && goal.trim()) await db.update("app_settings", "app", { business_goal: goal.trim().slice(0, 160) });
    write("focus:business_goal", null);
  }

  const aspects = parse<Record<string, number>>(read("board-aspects"));
  if (aspects) {
    for (const [id, aspect] of Object.entries(aspects)) {
      if (!(typeof aspect === "number" && aspect > 0)) continue;
      const row = await db.get("board_item", id);
      if (row && (row.aspect === null || row.aspect === undefined)) await db.update("board_item", id, { aspect });
    }
    write("board-aspects", null);
  }
}
