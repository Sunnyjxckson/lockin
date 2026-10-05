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
  start_date: "2026-10-05",
  length_days: 30,
  money_target: 1000,
  money_deadline: "2026-10-14",
  daily_floor: 100,
} satisfies Omit<Challenge, "created_at">;

export const SEED_SETTINGS: Omit<AppSettings, "created_at"> = {
  id: "app",
  seeded: true,
  timezone: "America/New_York",
  quiet_start: "23:00",
  quiet_end: "05:30",
  carbs_target: 180,
  fat_target: 60,
  weight_unit: "lb",
  haptics: true,
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

const WEEKEND = (lateNight: boolean): BlockSeed[] => [
  WAKE,
  ["Jump rope + core", "06:30", "07:00", "workout", false],
  ["Home, shower, eat", "07:00", "08:00", "home", true],
  ["Study, homework, business", "08:00", "11:00", "study", true, "Longest block of the week."],
  ["Delivery: lunch", "11:00", "14:00", "delivery", true],
  ["Basketball", "14:30", "16:30", "basketball", true, "Optional."],
  ["Delivery: dinner", "17:00", "21:00", "delivery", true],
  ...(lateNight ? ([["Delivery: late night", "21:00", "23:00", "delivery", true]] as BlockSeed[]) : []),
  BED,
];

const TEMPLATE_BY_DAY: Record<Weekday, BlockSeed[]> = {
  0: WEEKEND(false),
  1: MON_WED("Lift + core"),
  2: TUE_THU,
  3: MON_WED("Light basketball + core"),
  4: TUE_THU,
  5: FRI,
  6: WEEKEND(true),
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

const ex = (name: string, sets: number, reps: string): Exercise => ({ name, sets, reps });

type WorkoutSeed = Omit<Workout, "id" | "created_at">;

export const SEED_WORKOUTS: WorkoutSeed[] = [
  {
    weekday: 1,
    slot: "main",
    name: "Upper A",
    kind: "lift",
    detail: "Push focus",
    exercises: [
      ex("Bench press", 4, "6 to 8"),
      ex("Barbell row", 4, "8"),
      ex("Overhead press", 3, "8 to 10"),
      ex("Lat pulldown", 3, "10 to 12"),
      ex("Dumbbell curl", 3, "12"),
      ex("Triceps pushdown", 3, "12"),
    ],
  },
  {
    weekday: 2,
    slot: "main",
    name: "Lower",
    kind: "lift",
    detail: "Squat focus",
    exercises: [
      ex("Back squat", 4, "6 to 8"),
      ex("Romanian deadlift", 3, "8 to 10"),
      ex("Walking lunge", 3, "10 each leg"),
      ex("Leg curl", 3, "12"),
      ex("Standing calf raise", 4, "12 to 15"),
    ],
  },
  {
    weekday: 3,
    slot: "main",
    name: "Light basketball",
    kind: "sport",
    detail: "Easy pace, recovery day",
    exercises: [ex("Form shooting", 1, "10 min"), ex("Spot shooting", 1, "15 min"), ex("Easy full court runs", 1, "10 min")],
  },
  {
    weekday: 4,
    slot: "main",
    name: "Upper B",
    kind: "lift",
    detail: "Pull focus",
    exercises: [
      ex("Pull up", 4, "6 to 10"),
      ex("Incline dumbbell press", 4, "8 to 10"),
      ex("Seated cable row", 3, "10"),
      ex("Lateral raise", 3, "12 to 15"),
      ex("Face pull", 3, "15"),
      ex("Dip", 3, "8 to 12"),
    ],
  },
  {
    weekday: 5,
    slot: "main",
    name: "Lower",
    kind: "lift",
    detail: "Hinge focus",
    exercises: [
      ex("Deadlift", 3, "5"),
      ex("Leg press", 3, "10"),
      ex("Bulgarian split squat", 3, "8 each leg"),
      ex("Hip thrust", 3, "10"),
      ex("Seated calf raise", 4, "15"),
    ],
  },
  {
    weekday: 6,
    slot: "main",
    name: "Jump rope",
    kind: "cardio",
    detail: "15 to 20 min",
    exercises: [ex("Easy warm up", 1, "3 min"), ex("Rounds: 90 sec on, 30 sec off", 8, "2 min"), ex("Easy cool down", 1, "1 min")],
  },
  {
    weekday: 0,
    slot: "main",
    name: "Jump rope",
    kind: "cardio",
    detail: "10 min",
    exercises: [ex("Steady rounds: 2 min on, 30 sec off", 4, "2 min 30 sec")],
  },
  // Core rotation, 5 to 10 minutes, one routine per weekday.
  {
    weekday: 1,
    slot: "core",
    name: "Core: anti-extension",
    kind: "lift",
    detail: "About 7 min",
    exercises: [ex("Plank", 3, "45 sec"), ex("Dead bug", 3, "10 each side"), ex("Ab wheel rollout", 3, "8")],
  },
  {
    weekday: 2,
    slot: "core",
    name: "Core: obliques",
    kind: "lift",
    detail: "About 7 min",
    exercises: [ex("Side plank", 3, "30 sec each side"), ex("Russian twist", 3, "20"), ex("Suitcase carry", 3, "30 sec each side")],
  },
  {
    weekday: 3,
    slot: "core",
    name: "Core: lower abs",
    kind: "lift",
    detail: "About 6 min",
    exercises: [ex("Hanging knee raise", 3, "12"), ex("Reverse crunch", 3, "15"), ex("Flutter kick", 3, "30 sec")],
  },
  {
    weekday: 4,
    slot: "core",
    name: "Core: anti-rotation",
    kind: "lift",
    detail: "About 7 min",
    exercises: [ex("Pallof press", 3, "10 each side"), ex("Bird dog", 3, "10 each side"), ex("Plank shoulder tap", 3, "20")],
  },
  {
    weekday: 5,
    slot: "core",
    name: "Core: weighted",
    kind: "lift",
    detail: "About 8 min",
    exercises: [ex("Cable crunch", 3, "12 to 15"), ex("Hanging leg raise", 3, "10"), ex("Weighted plank", 3, "30 sec")],
  },
  {
    weekday: 6,
    slot: "core",
    name: "Core: circuit",
    kind: "lift",
    detail: "About 8 min, 3 rounds",
    exercises: [ex("Mountain climber", 3, "30 sec"), ex("Bicycle crunch", 3, "20"), ex("V-up", 3, "10"), ex("Hollow hold", 3, "30 sec")],
  },
  {
    weekday: 0,
    slot: "core",
    name: "Core: easy",
    kind: "lift",
    detail: "About 5 min",
    exercises: [ex("Hollow hold", 3, "30 sec"), ex("Glute bridge", 3, "15"), ex("Side plank", 2, "30 sec each side")],
  },
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
