// Starting defaults from the PRD. Nothing here is read at runtime after the
// first run: it is written to the database once and edited in Settings.

import type {
  AppSettings,
  BlockKind,
  Challenge,
  ChecklistItem,
  Exercise,
  NewRow,
  Reminder,
  ScheduleTemplate,
  Weekday,
  Workout,
} from "../types";

export const SEED_CHALLENGE: NewRow<"challenge"> = {
  id: "challenge",
  name: "30 day lock in",
  status: "active",
  ended_on: null,
  rules: null,
  restart_of: null,
  start_date: "2026-10-05",
  length_days: 30,
  money_target: 1000,
  money_deadline: "2026-10-14",
  daily_floor: 100,
  money_target_start: null,
} satisfies Omit<Challenge, "created_at">;

/** history_start is set when the seed runs: the challenge start, or the install day if that is earlier. */
export const SEED_SETTINGS: Omit<AppSettings, "created_at" | "history_start"> = {
  id: "app",
  seeded: true,
  timezone: "America/New_York",
  quiet_start: "23:00",
  quiet_end: "05:30",
  carbs_target: 180,
  fat_target: 60,
  weight_unit: "lb",
  haptics: true,
  daily_floor: 100,
  weekly_food_budget: null,
  food_likes: [],
  food_dislikes: [],
  focus_goal_minutes: 60,
  business_goal: null,
  preferred_store: null,
  display_name: "Sunny",
  coach_voice: "stoic",
  coach_checkins: { post_workout: true, slip: true, missed_item: true },
  library_position: null,
  drops_enabled: false,
  drops_per_day: 3,
};

type ItemSeed = Omit<ChecklistItem, "id" | "created_at" | "sort_order" | "archived">;

function habit(p: Partial<ItemSeed> & Pick<ItemSeed, "key" | "name" | "type" | "target">): ItemSeed {
  return {
    cadence: "daily",
    category: "habit",
    mode: null,
    unit: null,
    hint: null,
    active: true,
    weekly_day: null,
    with_photo: false,
    tracks_money: false,
    typical_spend: null,
    spend_period: null,
    track: null,
    ...p,
  };
}

function vice(key: string, name: string, active: boolean, tracksMoney = false): ItemSeed {
  return {
    key: `vice_${key}`,
    name,
    type: "yesno",
    cadence: "daily",
    target: { kind: "check" },
    category: "vice",
    mode: "quit",
    unit: null,
    hint: active ? "Check at end of day" : null,
    active,
    weekly_day: null,
    with_photo: false,
    tracks_money: tracksMoney,
    typical_spend: null,
    spend_period: null,
    track: null,
  };
}

/** The 14 checklist items from the PRD table, in order. */
export const SEED_ITEMS: ItemSeed[] = [
  habit({ key: "wake", name: "Up by 5:45", type: "yesno", target: { kind: "check_by", by: "06:00" }, hint: "Check before 6:00" }),
  habit({ key: "workout", name: "Workout", type: "yesno", target: { kind: "check" } }),
  habit({ key: "core", name: "Core", type: "yesno", target: { kind: "check" }, hint: "5 to 10 min" }),
  habit({ key: "calories", name: "Calories", type: "number", target: { kind: "range", min: 1900, max: 2100 }, unit: "kcal" }),
  habit({ key: "protein", name: "Protein", type: "number", target: { kind: "min", min: 180 }, unit: "g" }),
  habit({ key: "earned", name: "Earned today", type: "number", target: { kind: "min", min: 100 }, unit: "$" }),
  vice("smoking", "No smoking", true),
  vice("drinking", "No drinking", true),
  vice("masturbation", "No masturbation", true),
  habit({ key: "study", name: "Study or homework block", type: "yesno", target: { kind: "check" }, hint: "Scheduled block completed" }),
  habit({ key: "business", name: "Business move", type: "text", target: { kind: "text" }, hint: "School deal, cohort, investor, client" }),
  habit({ key: "bed", name: "In bed on time", type: "yesno", target: { kind: "check" }, hint: "Check next morning" }),
  habit({ key: "talk", name: "Talk to one girl at school", type: "yesno", cadence: "weekly", target: { kind: "check" }, hint: "Once per week" }),
  habit({
    key: "weighin",
    name: "Weigh-in and photo",
    type: "number",
    cadence: "weekly",
    target: { kind: "min", min: 1 },
    unit: "lb",
    hint: "Friday morning",
    weekly_day: 5,
    with_photo: true,
  }),
];

/** The rest of the vice library from PRD section 12. Off until turned on. */
export const SEED_VICE_LIBRARY: ItemSeed[] = [
  vice("vaping", "No vaping", false),
  vice("weed", "No weed", false),
  vice("gambling", "No gambling or sports betting", false, true),
  vice("porn", "No porn", false),
  vice("junk_food", "No junk food", false),
  vice("fast_food", "No fast food", false),
  vice("energy_drinks", "No energy drinks", false),
  vice("doomscrolling", "No doomscrolling", false),
  vice("impulse_spending", "No impulse spending", false, true),
];

// ---------- schedule template ----------

type BlockSeed = [name: string, start: string, end: string, kind: BlockKind, flexible: boolean, note?: string];

const WAKE: BlockSeed = ["Wake", "05:45", "06:30", "wake", false];
const BED: BlockSeed = ["Bed", "23:00", "23:59", "bed", false];

const MON_WED = (workout: string): BlockSeed[] => [
  WAKE,
  [workout, "06:30", "07:30", "workout", false],
  ["Home, shower, eat", "07:30", "09:00", "home", true],
  ["Class", "09:30", "16:00", "class", false, "Ends 4:00. Start time to confirm."],
  ["Basketball", "17:00", "19:00", "basketball", true],
  ["Delivery", "19:00", "20:00", "delivery", true, "Lunch 11:00 to 2:00 instead if class allows."],
  ["Study, homework, business", "20:00", "23:00", "study", true, "Pick one or two."],
  BED,
];

const TUE_THU: BlockSeed[] = [
  WAKE,
  ["Lift + core", "06:30", "07:30", "workout", false],
  ["Home, shower, eat", "07:30", "09:30", "home", true],
  ["Class", "10:00", "14:30", "class", false],
  ["Basketball", "15:00", "16:30", "basketball", true, "Optional."],
  ["Delivery: dinner", "17:00", "21:00", "delivery", true],
  ["Study, homework, business", "21:00", "23:00", "study", true],
  BED,
];

const FRI: BlockSeed[] = [
  WAKE,
  ["Lift + core", "06:30", "07:30", "workout", false],
  ["Home, shower, eat", "07:30", "09:00", "home", true],
  ["Class", "09:00", "11:00", "class", false, "Times to confirm."],
  ["Delivery: lunch", "11:00", "14:00", "delivery", true],
  ["Basketball", "14:30", "16:30", "basketball", true, "Optional."],
  ["Delivery: dinner", "17:00", "20:00", "delivery", true],
  ["Study, homework, business", "20:00", "21:30", "study", true],
  ["Delivery: late night", "21:30", "23:00", "delivery", true],
  BED,
];

const WEEKEND = (lateNight: boolean, workout: string): BlockSeed[] => [
  WAKE,
  [workout, "06:30", "07:00", "workout", false],
  ["Home, shower, eat", "07:00", "08:00", "home", true],
  ["Study, homework, business", "08:00", "11:00", "study", true, "Longest block of the week."],
  ["Delivery: lunch", "11:00", "14:00", "delivery", true],
  ["Basketball", "14:30", "16:30", "basketball", true, "Optional."],
  ["Delivery: dinner", "17:00", "21:00", "delivery", true],
  ...(lateNight ? ([["Delivery: late night", "21:00", "23:00", "delivery", true]] as BlockSeed[]) : []),
  BED,
];

const TEMPLATE_BY_DAY: Record<Weekday, BlockSeed[]> = {
  0: WEEKEND(false, "Rest or easy rope + core"),
  1: MON_WED("Lift + core"),
  2: TUE_THU,
  3: MON_WED("Cardio + core"),
  4: TUE_THU,
  5: FRI,
  6: WEEKEND(true, "Jump rope + core"),
};

export const SEED_TEMPLATE: NewRow<"schedule_template">[] = (Object.keys(TEMPLATE_BY_DAY) as unknown as string[]).flatMap(
  (d) => {
    const weekday = Number(d) as Weekday;
    return TEMPLATE_BY_DAY[weekday].map(
      ([block_name, start, end, kind, flexible, note]): Omit<ScheduleTemplate, "id" | "created_at"> => ({
        weekday,
        block_name,
        start,
        end,
        kind,
        flexible,
        note: note ?? null,
      }),
    );
  },
);

// ---------- workouts ----------

const ex = (name: string, sets: number, reps: string, weight?: string, note?: string): Exercise => ({
  name,
  sets,
  reps,
  ...(weight ? { weight } : {}),
  ...(note ? { note } : {}),
});

type WorkoutSeed = Omit<Workout, "id" | "created_at">;

const CORE_AB = () => ex("eGym ab machine", 3, "12 to 15");
const CORE_KNEE = () => ex("Hanging knee raises", 3, "10 to 12");
const CORE_REV = () => ex("Reverse crunches", 3, "15");

const core = (weekday: Weekday, name: string, exercises: Exercise[], detail = "About 6 min"): WorkoutSeed => ({
  weekday,
  slot: "core",
  name,
  kind: "lift",
  detail,
  exercises,
});

export const SEED_WORKOUTS: WorkoutSeed[] = [
  {
    weekday: 1,
    slot: "main",
    name: "Upper A",
    kind: "lift",
    detail: null,
    exercises: [
      ex("Incline DB press", 3, "8 to 10", "40s (try 45s)"),
      ex("Lat pulldown", 3, "10", "200"),
      ex("Seated cable row", 3, "10", "100"),
      ex("Lateral raises", 3, "12 to 15", "7.5 lb"),
      ex("Face pulls", 3, "15", "45"),
    ],
  },
  {
    weekday: 2,
    slot: "main",
    name: "Lower",
    kind: "lift",
    detail: null,
    exercises: [
      ex("Box jumps", 3, "5", undefined, "35 inch box, step down"),
      ex("RDL", 3, "8", "55s"),
      ex("Bulgarian split squats", 3, "10 each leg", "35s"),
      ex("Leg curl", 2, "12"),
      ex("Calf raises", 3, "15", "Light"),
    ],
  },
  {
    weekday: 3,
    slot: "main",
    name: "Cardio",
    kind: "cardio",
    detail: "Basketball about 1 hour, or 30 to 60 min Peloton",
    exercises: [ex("Basketball", 1, "about 1 hour", undefined, "or 30 to 60 min on the Peloton")],
  },
  {
    weekday: 4,
    slot: "main",
    name: "Upper B",
    kind: "lift",
    detail: null,
    exercises: [
      ex("Pull-ups", 3, "6 to 10", undefined, "Assisted if under 6"),
      ex("eGym shoulder press", 3, "10", "Light"),
      ex("Push-ups", 3, "close to failure", undefined, "Bodyweight"),
      ex("Lateral raises", 3, "12 to 15", "7.5 lb"),
      ex("Face pulls", 3, "15", "45"),
    ],
  },
  {
    weekday: 5,
    slot: "main",
    name: "Lower",
    kind: "lift",
    detail: null,
    exercises: [
      ex("Box jumps", 3, "5", undefined, "35 inch box, step down"),
      ex("RDL", 3, "8", "55s"),
      ex("Bulgarian split squats", 3, "10 each leg", "35s"),
      ex("Leg curl", 2, "12"),
      ex("Calf raises", 3, "15", "Light"),
    ],
  },
  {
    weekday: 6,
    slot: "main",
    name: "Jump rope",
    kind: "cardio",
    detail: "3 rounds of 10 min",
    exercises: [ex("Jump rope", 3, "10 min", undefined, "2 min rest between"), ex("Basketball", 1, "optional")],
  },
  {
    weekday: 0,
    slot: "main",
    name: "Rest",
    kind: "rest",
    detail: "Full rest, or 10 min easy jump rope",
    exercises: [ex("Easy jump rope", 1, "10 min", undefined, "optional")],
  },
  // Core: three moves, two a day, in a different pair or order each day so the names stay unique.
  core(1, "Core: ab machine + knee raises", [CORE_AB(), CORE_KNEE()]),
  core(2, "Core: knee raises + reverse crunches", [CORE_KNEE(), CORE_REV()]),
  core(3, "Core: reverse crunches + ab machine", [CORE_REV(), CORE_AB()]),
  core(4, "Core: knee raises + ab machine", [CORE_KNEE(), CORE_AB()]),
  core(5, "Core: ab machine + reverse crunches", [CORE_AB(), CORE_REV()]),
  core(6, "Core: reverse crunches + knee raises", [CORE_REV(), CORE_KNEE()]),
  core(0, "Core: optional, ab machine + knee raises", [CORE_AB(), CORE_KNEE()], "Optional"),
];

// ---------- reminders ----------

type ReminderSeed = Omit<Reminder, "id" | "created_at" | "sort_order" | "item_id">;

export const SEED_REMINDERS: ReminderSeed[] = [
  { kind: "wake", label: "Wake", body: "5:45. Feet on the floor.", time: "05:45", block_name: null, offset_minutes: 0, enabled: true },
  { kind: "workout", label: "Workout", body: "Workout starts in 15 minutes.", time: "06:15", block_name: null, offset_minutes: 0, enabled: true },
  {
    kind: "delivery",
    label: "Delivery block",
    body: "Delivery block starts soon.",
    time: null,
    block_name: "Delivery",
    offset_minutes: -10,
    enabled: true,
  },
  { kind: "earnings_nudge", label: "Earnings nudge", body: "Under the floor for today. Get back out.", time: "20:00", block_name: null, offset_minutes: 0, enabled: true },
  { kind: "checkin", label: "End of day check-in", body: "Close out the day.", time: "22:30", block_name: null, offset_minutes: 0, enabled: true },
];
