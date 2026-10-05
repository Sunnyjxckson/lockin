// Data upgrades for rows written by an earlier build. In Supabase mode the SQL
// migrations do this work, so this only runs against the device store.
// Every step is safe to run again and does nothing once the data is current.

import { db } from "./index";
import { syncSlipCount } from "./helpers";
import { todayNY, nyParts } from "../logic/dates";
import { parseLegacySpendHint } from "../logic/vices";
import type { AppSettings, Challenge, DateStr } from "../types";

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
    const rest = missing<AppSettings>(settings, { weekly_food_budget: null, food_likes: [], food_dislikes: [], focus_goal_minutes: 60 });
    if (patch || rest) await db.update("app_settings", "app", { ...patch, ...rest });
  }
}
