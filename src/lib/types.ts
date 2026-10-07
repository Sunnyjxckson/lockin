// Every table in the app. Field names are snake_case and match
// the files in supabase/migrations column for column (schema.test.ts checks).
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
//
// The app runs in ongoing mode by default: logs are keyed by date and never
// reset. A challenge is an optional layer on top: a start, a length and its
// own rules. Rows are kept when a challenge is over, so past ones can be
// looked at. At most one row has status "active".

/**
 * active: the one in play (it may not have started yet, or its last day may
 * have passed without being closed). succeeded: ran its full length.
 * ended: stopped early by choice. abandoned: thrown away by a restart.
 */
export type ChallengeStatus = "active" | "ended" | "succeeded" | "abandoned";

/** One item a challenge holds you to. */
export interface ChallengeRule {
  item_id: string;
  /** The target for the length of the challenge. Null keeps the item's own target. */
  target: Target | null;
}

export interface Challenge extends Base {
  name: string;
  status: ChallengeStatus;
  start_date: DateStr;
  length_days: number;
  /** The last day it ran. Null while active. Before start_date when it never ran a day. */
  ended_on: DateStr | null;
  /** The items that count toward the challenge. Null means the whole checklist as it stands each day. */
  rules: ChallengeRule[] | null;
  /** The challenge this one restarted. */
  restart_of: string | null;
  /** Null when the challenge has no money target. */
  money_target: number | null;
  money_deadline: DateStr | null;
  /** The floor when the challenge was set up. The live floor is app_settings.daily_floor. */
  daily_floor: number;
  /** First date that counts toward the current money target. Null means the
   * challenge start. Set when the target is reset, so the new target starts
   * a fresh running total. */
  money_target_start: DateStr | null;
}

// ---------- checklist ----------

export type ItemType = "yesno" | "number" | "text";
export type Cadence = "daily" | "weekly";
export type ItemCategory = "habit" | "vice";
export type ViceMode = "quit" | "cap";
export type SpendPeriod = "day" | "week";

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

/** The four tracks Today sums the day up in. */
export type Track = "body" | "money" | "mind" | "clean";

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
  /** Which of the four tracks on Today the item counts toward. Null means the default for it, see `trackOf` in logic/tracks. */
  track: Track | null;
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
  /** Money vices: what the habit usually costs, per `spend_period`. Drives dollars kept. */
  typical_spend: number | null;
  spend_period: SpendPeriod | null;
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
  /** How many vice_slip rows exist for this item on this date. Kept in step
   * by syncSlipCount(). Above zero the item is not done that day, whatever
   * the tick or the number says. */
  slips: number;
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
  /**
   * Morning briefs only: the challenge, money target and floor it was written
   * from (briefBasis in logic/coach). Null or missing for older notes, flags and reviews.
   */
  basis?: string | null;
}

export type CoachVoice = "stoic" | "sergeant" | "brother";
export const COACH_VOICES: readonly CoachVoice[] = ["stoic", "sergeant", "brother"];

/** Why a coach message was written: an answer in the chat, or a check-in it sent by itself. */
export type CoachTrigger = "chat" | "post_workout" | "slip" | "missed_item";

/** Which check-ins the coach may send by itself. */
export interface CoachCheckins {
  post_workout: boolean;
  slip: boolean;
  missed_item: boolean;
}

/** One message in the coach chat, yours or the coach's. */
export interface CoachMessage extends Base {
  /** The New York date it was sent on. */
  date: DateStr;
  sent_at: IsoStr;
  sender: "me" | "coach";
  body: string;
  trigger: CoachTrigger;
  /** Coach messages only: written by the model or by the rules. */
  source: "ai" | "fallback" | null;
  /** Key of the line from the quote library it used (logic/coachQuotes). */
  quote: string | null;
  /** Check-ins only: what it is about, unique, so the same one is never sent twice. */
  check_key: string | null;
  /** False on a check-in until the chat has been opened. */
  read: boolean;
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

/** One row per reminder the scheduled job has sent. Server only. */
export interface ReminderSent extends Base {
  date: DateStr;
  /** "<date>:<reminder id>" or "<date>:<reminder id>:<block>". */
  key: string;
}

/** When the scheduled job last ran. One row, id "cron". Server only. */
export interface ReminderRun extends Base {
  last_run_at: IsoStr;
}

/** Wrong passcode counter. One row, id "passcode". Server only. */
export interface LoginAttempt extends Base {
  failures: number;
  locked_until: IsoStr | null;
}

// ---------- mood and motivation ----------

/** How the day feels, logged any time. */
export interface MoodLog extends Base {
  date: DateStr;
  time: TimeStr;
  /** 1 (low) to 5 (high). */
  mood: number;
  note: string | null;
}

export type MotivationKind = "quote" | "clip" | "why";

/** Something to come back to when motivation dips. */
export interface Motivation extends Base {
  kind: MotivationKind;
  body: string;
  /** A link for a clip, or the source of a quote. */
  url: string | null;
  sort_order: number;
}

// ---------- boards and themes ----------

export type BoardKind = "body" | "brand" | "life";

export interface Board extends Base {
  name: string;
  kind: BoardKind;
  /** The board_item shown as the cover. Null uses the first image. */
  cover_item_id: string | null;
  sort_order: number;
}

export type BoardItemKind = "image" | "color" | "note";
export type BoardItemSource = "camera" | "web" | "screenshot" | "upload";

export interface BoardItem extends Base {
  board_id: string;
  kind: BoardItemKind;
  /** A storage reference (resolve it with resolvePhoto). Null for colors and notes. */
  image_url: string | null;
  note: string | null;
  /** A single swatch, "#rrggbb". */
  color: string | null;
  /** Colors pulled from the image, "#rrggbb" each, most dominant first. */
  palette: string[] | null;
  source: BoardItemSource | null;
  /** Where a web image came from. */
  source_url: string | null;
  /** Width over height of an image, so the collage knows its shape before it loads. Null until measured. */
  aspect: number | null;
  sort_order: number;
}

export type ThemeBase = "dark" | "contrast";

/** Colors that sit on top of a base theme. Each is "#rrggbb". Leave one out and the base supplies it. */
export interface ThemePalette {
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  accent?: string;
}

/**
 * A saved look. One row is active. Read and write it through "@/lib/theme",
 * which also checks contrast and paints the page.
 */
export interface ThemeRow extends Base {
  name: string | null;
  base: ThemeBase;
  /** Null means the base theme as it ships. */
  palette: ThemePalette | null;
  /** The accent as it was picked, before any contrast fix. Same as palette.accent. */
  accent: string | null;
  /** The board the palette was pulled from. */
  board_id: string | null;
  active: boolean;
}

// ---------- meal planning ----------

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface Ingredient {
  name: string;
  quantity: number;
  /** "g", "oz", "cup", "each" and so on. */
  unit: string;
  /** Estimated dollars for this quantity. */
  est_cost: number | null;
  /** Grocery aisle, to group the list: "produce", "meat", "dairy", "pantry", "frozen", "other". */
  category: string | null;
}

/** Numbers are for one serving. */
export interface Recipe extends Base {
  name: string;
  slot: MealSlot;
  ingredients: Ingredient[];
  steps: string[];
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Estimated dollars for one serving. */
  est_cost: number;
  /** For likes and dislikes: "chicken", "vegetarian", "spicy". */
  tags: string[];
  photo_url: string | null;
  source: "seed" | "user" | "ai";
}

/** One meal in a planned week. */
export interface PlannedMeal {
  date: DateStr;
  slot: MealSlot;
  recipe_id: string;
  /** Portions to eat, so the day hits its numbers. */
  servings: number;
  /** The meal row written when it was cooked and logged. Missing or null until then. */
  logged?: string | null;
}

/** One planned week, Monday to Sunday. One row per week_start. */
export interface MealPlan extends Base {
  week_start: DateStr;
  budget: number;
  /** Every recipe used in the week, once each. */
  recipe_ids: string[];
  meals: PlannedMeal[];
  /** Estimated dollars for the week. */
  total_cost: number;
  /** The store the list is priced at. Null until one is picked. */
  store: string | null;
}

export const GROCERY_STORES = ["Aldi", "Walmart", "Food Lion", "Harris Teeter", "Publix"] as const;

export interface GroceryItem extends Base {
  plan_id: string;
  name: string;
  /** Combined across the week's recipes. */
  quantity: number;
  unit: string | null;
  category: string | null;
  /** The store this row is priced at. */
  store: string | null;
  /** Estimated dollars at `store`. */
  price: number | null;
  /** Estimated dollars at every store, by store name. */
  prices: Record<string, number> | null;
  bought: boolean;
}

/**
 * Money that went out. Groceries are the first use: buying a week's list
 * writes one row linked to the plan, and Money shows it.
 */
export interface Expense extends Base {
  date: DateStr;
  amount: number;
  /** "groceries" for now. */
  category: string;
  note: string | null;
  store: string | null;
  /** The meal plan a grocery run was for. */
  plan_id: string | null;
}

/** A food that is already at home, so the grocery list leaves it off. One row per food. */
export interface PantryItem extends Base {
  /** The food's key: lowercase, single spaces. */
  name: string;
}

/** What a pack really cost at a store, typed in from a receipt. It replaces the estimate. */
export interface ReceiptPrice extends Base {
  /** The food's key. */
  name: string;
  store: string;
  /** Dollars for one pack. */
  price: number;
}

// ---------- focus ----------

/** A stretch of time in milliseconds since the epoch. `to` is null while it is still open. */
export interface FocusSpan {
  from: number;
  to: number | null;
}

/** Time the app spent in the background while the timer ran. */
export interface FocusAway extends FocusSpan {
  /** The user said they were still working, so it stays in focused time. */
  counted: boolean;
  /** The user has answered the "you were gone" card. */
  reviewed: boolean;
}

/** The moving parts of a running timer, kept on its row so another device shows the same clock. */
export interface FocusLive {
  /** The exact start, milliseconds since the epoch. */
  started_at: number;
  /** Countdown length, or null to count up. */
  planned_seconds: number | null;
  pauses: FocusSpan[];
  aways: FocusAway[];
  /** When this state was last changed. The newer copy wins between a device and the row. */
  rev: number;
}

/**
 * One stretch of study or deep work. A running timer is a row with `end`
 * null: `start` is when it began, so the clock survives a reload.
 */
export interface FocusSession extends Base {
  date: DateStr;
  start: TimeStr;
  /** Null while the timer runs. */
  end: TimeStr | null;
  /** Whole minutes. 0 while the timer runs. */
  minutes: number;
  label: string | null;
  source: "timer" | "manual";
  /** The schedule block it ran in, if it was started from one. */
  block_id: string | null;
  /** Times the app was left while the timer ran. */
  away_count: number;
  /** Minutes away, claimed back or not. */
  away_minutes: number;
  /** Wall clock minutes from start to finish. Null for a session logged by hand. */
  clock_minutes: number | null;
  /** The countdown length. Null when it counted up or was logged by hand. */
  planned_minutes: number | null;
  /** A countdown that reached its length. */
  completed: boolean;
  /** Pauses and time away while the timer runs. Null once it is finished. */
  live: FocusLive | null;
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
  /** First date of the ongoing history. Nothing before it is scored. */
  history_start: DateStr;
  /** The least to earn each day, challenge or not. Same number as the "earned" item's target. */
  daily_floor: number;
  /** Dollars a week for food. Null until meal planning is set up. */
  weekly_food_budget: number | null;
  /** Foods and tags to lean toward and to leave out when planning meals. */
  food_likes: string[];
  food_dislikes: string[];
  /** Minutes of focus that count as the day's study block. */
  focus_goal_minutes: number;
  /** Where the business is going, in a sentence. Shown on the business log. */
  business_goal: string | null;
  /** The store grocery lists are priced at by default. Null until one is picked. */
  preferred_store: string | null;
  /** The name Today greets. Null or empty greets without one. */
  display_name: string | null;
  /** The voice the coach answers in. Missing on an old row means "stoic". */
  coach_voice: CoachVoice;
  /** Which check-ins the coach may send. Missing on an old row means all of them. */
  coach_checkins: CoachCheckins;
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
  coach_message: CoachMessage;
  push_subscription: PushSubscriptionRow;
  calendar_token: CalendarToken;
  reminder_sent: ReminderSent;
  reminder_run: ReminderRun;
  login_attempt: LoginAttempt;
  app_settings: AppSettings;
  mood_log: MoodLog;
  motivation: Motivation;
  board: Board;
  board_item: BoardItem;
  theme: ThemeRow;
  recipe: Recipe;
  meal_plan: MealPlan;
  grocery_item: GroceryItem;
  pantry_item: PantryItem;
  receipt_price: ReceiptPrice;
  expense: Expense;
  focus_session: FocusSession;
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
  "coach_message",
  "push_subscription",
  "calendar_token",
  "reminder_sent",
  "reminder_run",
  "login_attempt",
  "app_settings",
  "mood_log",
  "motivation",
  "board",
  "board_item",
  "theme",
  "recipe",
  "meal_plan",
  "grocery_item",
  "pantry_item",
  "receipt_price",
  "expense",
  "focus_session",
] as const satisfies readonly TableName[];

/** Tables only the server may read or write (they hold secrets). */
export const SERVER_ONLY_TABLES: readonly TableName[] = ["calendar_token", "push_subscription", "reminder_sent", "reminder_run", "login_attempt"];

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
