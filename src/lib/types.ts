// Every table in the app. Field names are snake_case and match
// supabase/migrations/0001_init.sql column for column.
//
// Conventions
// - id: text, generated on the client with crypto.randomUUID().
// - Calendar dates: "YYYY-MM-DD" in America/New_York. Type alias DateStr.
// - Clock times: 24 hour "HH:MM". Type alias TimeStr.
// - Instants: ISO strings (created_at, completed_at). Type alias IsoStr.
// - weekday: 0 is Sunday, 6 is Saturday (same as Date.getDay()).

export type DateStr = string;
export type TimeStr = string;
export type IsoStr = string;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface Base {
  id: string;
  created_at: IsoStr;
}

// ---------- challenge ----------

export interface Challenge extends Base {
  start_date: DateStr;
  length_days: number;
  money_target: number;
  money_deadline: DateStr;
  daily_floor: number;
}

// ---------- checklist ----------

export type ItemType = "yesno" | "number" | "text";
export type Cadence = "daily" | "weekly";
export type ItemCategory = "habit" | "vice";
export type ViceMode = "quit" | "cap";

/**
 * What "done" means for an item.
 * - check: a yes/no that is done when checked.
 * - check_by: a yes/no that only counts when checked at or before `by` on the
 *   day itself (Up by 5:45, checked before 6:00). Backfilled on a later date
 *   it counts on trust.
 * - min: number at or above `min` (protein 180, earned 100).
 * - max: number at or below `max` (a capped vice, for example 30 minutes).
 * - range: number between `min` and `max` inclusive (calories 1900 to 2100).
 * - text: text plus yes/no. Done when checked and the text is not empty.
 */
export type Target =
  | { kind: "check" }
  | { kind: "check_by"; by: TimeStr }
  | { kind: "min"; min: number }
  | { kind: "max"; max: number }
  | { kind: "range"; min: number; max: number }
  | { kind: "text" };

export interface ChecklistItem extends Base {
  /** Stable slug for seeded items so features can find them: wake, workout,
   * core, calories, protein, earned, study, business, bed, talk, weighin,
   * and vice_<key> for the vice library. Null for user-made items. */
  key: string | null;
  name: string;
  type: ItemType;
  cadence: Cadence;
  /** Current target. History lives in target_version. Write it with
   * saveItemVersion() so both stay in step. */
  target: Target;
  category: ItemCategory;
  /** Only for vices. */
  mode: ViceMode | null;
  /** Shown after numbers: "g", "$", "min", "lb", "kcal". */
  unit: string | null;
  /** Short helper line under the name. */
  hint: string | null;
  sort_order: number;
  /** In the checklist right now. Vices in the library that are off are false. */
  active: boolean;
  /** Removed in Settings. Hidden everywhere but still scores past days. */
  archived: boolean;
  /** Weekly items can name the day they are meant for (Friday weigh-in). */
  weekly_day: Weekday | null;
  /** Item also takes a photo (weigh-in). */
  with_photo: boolean;
  /** Money vices show dollars kept (gambling, impulse spending). */
  tracks_money: boolean;
}

/**
 * Versioned targets. One row per item per day a setting changed. The version
 * in force on date D is the row with the greatest effective_from <= D.
 * Past days keep the target, and the on/off state, they were scored against.
 */
export interface TargetVersion extends Base {
  item_id: string;
  effective_from: DateStr;
  target: Target;
  active: boolean;
}

export interface DayLog extends Base {
  date: DateStr;
  item_id: string;
  /** Number items: the number. Otherwise null. */
  value: number | null;
  /** Yes/no and text items: the tick. Number items: true when a value is set. */
  checked: boolean;
  /** Text items: what was done. */
  text: string | null;
  /** When it was ticked or the value was entered. Null when unticked. */
  completed_at: IsoStr | null;
}

/** A slip on a vice. */
export interface ViceSlip extends Base {
  item_id: string;
  date: DateStr;
  time: TimeStr;
  /** What set it off. */
  trigger: string | null;
  /** Dollars spent, for money vices. */
  amount: number | null;
}

// ---------- schedule ----------

export type BlockKind =
  | "wake"
  | "workout"
  | "home"
  | "class"
  | "delivery"
  | "basketball"
  | "study"
  | "bed"
  | "free"
  | "errand"
  | "other";

export interface ScheduleTemplate extends Base {
  weekday: Weekday;
  block_name: string;
  start: TimeStr;
  end: TimeStr;
  kind: BlockKind;
  /** Flexible blocks shift when an earlier block runs long. */
  flexible: boolean;
  note: string | null;
}

export interface ScheduleBlock extends Base {
  date: DateStr;
  block_name: string;
  start: TimeStr;
  end: TimeStr;
  /** Minutes. */
  duration: number;
  flexible: boolean;
  kind: BlockKind;
  note: string | null;
  calendar_event_id: string | null;
  /** The template row this came from, if any. */
  template_id: string | null;
  source: "template" | "manual" | "calendar";
}

// ---------- money ----------

export interface Earning extends Base {
  date: DateStr;
  amount: number;
  /** DoorDash, Uber Eats, Instacart, or anything else. */
  app: string;
  hours: number | null;
  screenshot_url: string | null;
}

// ---------- body ----------

export interface Meal extends Base {
  date: DateStr;
  time: TimeStr;
  name: string | null;
  photo_url: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface SavedMeal extends Base {
  name: string;
  photo_url: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  use_count: number;
}

export interface BodyLog extends Base {
  date: DateStr;
  weight: number | null;
  photo_url: string | null;
}

// ---------- workouts ----------

export interface Exercise {
  name: string;
  sets: number;
  /** Free text so it can hold "8 to 10", "45 sec", "10 each side". */
  reps: string;
}

export type WorkoutKind = "lift" | "cardio" | "sport" | "rest";
export type WorkoutSlot = "main" | "core";

/** One main workout and one core routine per weekday. */
export interface Workout extends Base {
  weekday: Weekday;
  slot: WorkoutSlot;
  name: string;
  kind: WorkoutKind;
  /** Short line under the name: "15 to 20 min". */
  detail: string | null;
  exercises: Exercise[];
}

export interface SetLog extends Base {
  date: DateStr;
  exercise: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
}

// ---------- reminders, coach ----------

export type ReminderKind = "wake" | "workout" | "delivery" | "checkin" | "earnings_nudge" | "custom";

/**
 * A reminder fires either at a fixed clock time (`time`) or relative to the
 * start of every schedule block named `block_name` (`offset_minutes`, negative
 * is before). item_id links a reminder to a checklist item when useful.
 */
export interface Reminder extends Base {
  kind: ReminderKind;
  label: string;
  body: string | null;
  time: TimeStr | null;
  block_name: string | null;
  item_id: string | null;
  offset_minutes: number;
  enabled: boolean;
  sort_order: number;
}

export interface CoachNote extends Base {
  date: DateStr;
  kind: "morning" | "weekly" | "flag";
  body: string;
  source: "ai" | "fallback";
}

// ---------- device and integration ----------

export interface PushSubscriptionRow extends Base {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
}

export interface CalendarToken extends Base {
  provider: "google";
  access_token: string;
  refresh_token: string | null;
  expires_at: IsoStr | null;
  calendar_id: string | null;
  sync_token: string | null;
}

/** Single row with id "app". */
export interface AppSettings extends Base {
  /** Set once seed data has been written. */
  seeded: boolean;
  timezone: string;
  /** No notifications between these two times. */
  quiet_start: TimeStr;
  quiet_end: TimeStr;
  /** Macro targets that are not checklist items. */
  carbs_target: number;
  fat_target: number;
  weight_unit: "lb" | "kg";
  haptics: boolean;
}

// ---------- table map ----------

export interface Tables {
  challenge: Challenge;
  checklist_item: ChecklistItem;
  target_version: TargetVersion;
  day_log: DayLog;
  vice_slip: ViceSlip;
  schedule_template: ScheduleTemplate;
  schedule_block: ScheduleBlock;
  earning: Earning;
  meal: Meal;
  saved_meal: SavedMeal;
  body_log: BodyLog;
  workout: Workout;
  set_log: SetLog;
  reminder: Reminder;
  coach_note: CoachNote;
  push_subscription: PushSubscriptionRow;
  calendar_token: CalendarToken;
  app_settings: AppSettings;
}

export type TableName = keyof Tables;
export type Row<K extends TableName> = Tables[K];
/** A row to insert. id and created_at are filled in when left out. */
export type NewRow<K extends TableName> = Omit<Tables[K], "id" | "created_at"> & {
  id?: string;
  created_at?: IsoStr;
};

export const TABLE_NAMES = [
  "challenge",
  "checklist_item",
  "target_version",
  "day_log",
  "vice_slip",
  "schedule_template",
  "schedule_block",
  "earning",
  "meal",
  "saved_meal",
  "body_log",
  "workout",
  "set_log",
  "reminder",
  "coach_note",
  "push_subscription",
  "calendar_token",
  "app_settings",
] as const satisfies readonly TableName[];

/** Tables only the server may read or write (they hold secrets). */
export const SERVER_ONLY_TABLES: readonly TableName[] = ["calendar_token", "push_subscription"];

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
