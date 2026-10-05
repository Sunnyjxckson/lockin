// Column list for every table, checked by the compiler against types.ts:
// add or rename a field there and this file stops compiling until it matches.
// schema.test.ts then checks the SQL migration against this list, so types,
// this map and the files in supabase/migrations cannot drift apart.

import type { Row, TableName } from "../types";

export type SqlType = "text" | "date" | "timestamptz" | "numeric" | "integer" | "smallint" | "boolean" | "jsonb";

type Columns = { [K in TableName]: { [C in keyof Row<K>]-?: SqlType } };

const base = { id: "text", created_at: "timestamptz" } as const;

export const COLUMNS: Columns = {
  challenge: {
    ...base,
    start_date: "date",
    length_days: "integer",
    money_target: "numeric",
    money_deadline: "date",
    daily_floor: "numeric",
    money_target_start: "date",
  },
  checklist_item: {
    ...base,
    key: "text",
    name: "text",
    type: "text",
    cadence: "text",
    target: "jsonb",
    category: "text",
    mode: "text",
    unit: "text",
    hint: "text",
    sort_order: "integer",
    active: "boolean",
    archived: "boolean",
    weekly_day: "smallint",
    with_photo: "boolean",
    tracks_money: "boolean",
    typical_spend: "numeric",
    spend_period: "text",
  },
  target_version: { ...base, item_id: "text", effective_from: "date", target: "jsonb", active: "boolean" },
  day_log: { ...base, date: "date", item_id: "text", value: "numeric", checked: "boolean", text: "text", completed_at: "timestamptz", slips: "integer" },
  vice_slip: { ...base, item_id: "text", date: "date", time: "text", trigger: "text", amount: "numeric" },
  schedule_template: {
    ...base,
    weekday: "smallint",
    block_name: "text",
    start: "text",
    end: "text",
    kind: "text",
    flexible: "boolean",
    note: "text",
  },
  schedule_block: {
    ...base,
    date: "date",
    block_name: "text",
    start: "text",
    end: "text",
    duration: "integer",
    flexible: "boolean",
    kind: "text",
    note: "text",
    calendar_event_id: "text",
    template_id: "text",
    source: "text",
  },
  earning: { ...base, date: "date", amount: "numeric", app: "text", hours: "numeric", screenshot_url: "text" },
  meal: {
    ...base,
    date: "date",
    time: "text",
    name: "text",
    photo_url: "text",
    calories: "numeric",
    protein: "numeric",
    carbs: "numeric",
    fat: "numeric",
  },
  saved_meal: {
    ...base,
    name: "text",
    photo_url: "text",
    calories: "numeric",
    protein: "numeric",
    carbs: "numeric",
    fat: "numeric",
    use_count: "integer",
  },
  body_log: { ...base, date: "date", weight: "numeric", photo_url: "text" },
  workout: { ...base, weekday: "smallint", slot: "text", name: "text", kind: "text", detail: "text", exercises: "jsonb" },
  set_log: { ...base, date: "date", exercise: "text", set_number: "integer", weight: "numeric", reps: "integer" },
  reminder: {
    ...base,
    kind: "text",
    label: "text",
    body: "text",
    time: "text",
    block_name: "text",
    item_id: "text",
    offset_minutes: "integer",
    enabled: "boolean",
    sort_order: "integer",
  },
  coach_note: { ...base, date: "date", kind: "text", body: "text", source: "text" },
  push_subscription: { ...base, endpoint: "text", p256dh: "text", auth: "text", user_agent: "text" },
  calendar_token: {
    ...base,
    provider: "text",
    access_token: "text",
    refresh_token: "text",
    expires_at: "timestamptz",
    calendar_id: "text",
    sync_token: "text",
  },
  reminder_sent: { ...base, date: "date", key: "text" },
  reminder_run: { ...base, last_run_at: "timestamptz" },
  login_attempt: { ...base, failures: "integer", locked_until: "timestamptz" },
  app_settings: {
    ...base,
    seeded: "boolean",
    timezone: "text",
    quiet_start: "text",
    quiet_end: "text",
    carbs_target: "numeric",
    fat_target: "numeric",
    weight_unit: "text",
    haptics: "boolean",
  },
};

/**
 * Column sets upsert() may name as its conflict target. Each has a unique
 * index in the migration, which Supabase needs. The local backend accepts
 * any columns, so a new pair must also get a unique index in a new migration.
 */
export const UNIQUE_KEYS: { [K in TableName]?: (keyof Row<K> & string)[][] } = {
  target_version: [["item_id", "effective_from"]],
  day_log: [["date", "item_id"]],
  body_log: [["date"]],
  workout: [["weekday", "slot"]],
  set_log: [["date", "exercise", "set_number"]],
  push_subscription: [["endpoint"]],
  calendar_token: [["provider"]],
  reminder_sent: [["key"]],
};
