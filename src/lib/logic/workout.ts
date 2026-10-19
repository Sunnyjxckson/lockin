// Set logging rules: last session per exercise, what to prefill, and how
// many sets are logged. Pure, no db.

import type { DateStr, Exercise, SetLog, Workout } from "../types";

export function sameExercise(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function hasNumbers(l: SetLog): boolean {
  return l.reps !== null || l.weight !== null;
}

/** The sets of the most recent session of an exercise before `before`, in set order. */
export function lastSession(logs: readonly SetLog[], exercise: string, before: DateStr): SetLog[] {
  let latest: DateStr | null = null;
  for (const l of logs) {
    if (l.date >= before || !hasNumbers(l) || !sameExercise(l.exercise, exercise)) continue;
    if (latest === null || l.date > latest) latest = l.date;
  }
  if (latest === null) return [];
  return logs
    .filter((l) => l.date === latest && hasNumbers(l) && sameExercise(l.exercise, exercise))
    .sort((a, b) => a.set_number - b.set_number);
}

export function lastSessionByExercise(
  logs: readonly SetLog[],
  exercises: readonly Pick<Exercise, "name">[],
  before: DateStr,
): Record<string, SetLog[]> {
  const out: Record<string, SetLog[]> = {};
  for (const e of exercises) out[e.name] = lastSession(logs, e.name, before);
  return out;
}

/** The logged sets of one exercise on one date, in set order. */
export function setsOn(logs: readonly SetLog[], exercise: string, date: DateStr): SetLog[] {
  return logs
    .filter((l) => l.date === date && sameExercise(l.exercise, exercise))
    .sort((a, b) => a.set_number - b.set_number);
}

/** First whole number in a reps note: "6 to 8" is 6. Null for timed work. */
export function parseReps(reps: string): number | null {
  if (/\b(sec|secs|seconds?|min|mins|minutes?)\b/i.test(reps)) return null;
  const m = reps.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** The weight to start from, from the plan text: "40s (try 45s)" is 40, "7.5 lb" is 7.5, "Light" is null. */
export function parseWeight(weight: string | null | undefined): number | null {
  if (!weight) return null;
  const m = weight.match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** The top of a rep range: "8 to 10" is 10, "10" is 10. Null for timed or non numeric text. */
export function topReps(reps: string): number | null {
  if (/\b(sec|secs|seconds?|min|mins|minutes?|hours?|hrs?)\b/i.test(reps)) return null;
  const all = reps.match(/\d+/g);
  if (!all) return null;
  if (/\b(each|per)\b/i.test(reps) && all.length > 1) return null;
  return Number(all[all.length - 1]);
}

export const WEIGHT_STEP = 5;

/**
 * The +5 lb rule: when the last session logged every planned set with every
 * set at the top of the rep range, the next session goes up by 5. Null when
 * the last session fell short, had no weight, or the reps are not a count.
 */
export function suggestedWeight(exercise: Pick<Exercise, "sets" | "reps">, lastSets: readonly SetLog[]): number | null {
  const top = topReps(exercise.reps);
  if (top === null) return null;
  const sets = lastSets.filter((l) => l.set_number >= 1 && l.set_number <= exercise.sets);
  if (new Set(sets.map((l) => l.set_number)).size < exercise.sets) return null;
  if (!sets.every((l) => l.reps !== null && l.reps >= top && l.weight !== null && l.weight > 0)) return null;
  const weights = sets.map((l) => l.weight as number);
  return Math.max(...weights) + WEIGHT_STEP;
}

export interface SetValues {
  weight: number | null;
  reps: number | null;
}

/**
 * What a set starts out as, so logging it is one tap when nothing changed:
 * 1. Same set last session (or last session's final set when it had fewer).
 * 2. If the set just before it today was logged heavier or lighter than last
 *    time, carry that weight forward.
 * 3. With no history, the planned reps and the planned weight when it is a number.
 * A last session that hit the top of the range on every set starts the first
 * set of a new session 5 lb higher (suggestedWeight).
 */
export function prefillSet(exercise: Exercise, setNumber: number, last: readonly SetLog[], today: readonly SetLog[]): SetValues {
  const lastSame = last.find((l) => l.set_number === setNumber) ?? (last.length > 0 ? last[last.length - 1] : null);
  const prevToday = today.find((l) => l.set_number === setNumber - 1) ?? null;
  const lastPrev = last.find((l) => l.set_number === setNumber - 1) ?? null;
  let weight = lastSame?.weight ?? null;
  let reps = lastSame?.reps ?? parseReps(exercise.reps);
  if (!lastSame) weight = parseWeight(exercise.weight);
  const bump = suggestedWeight(exercise, last);
  if (bump !== null && setNumber === 1) weight = bump;
  if (prevToday && prevToday.weight !== null && (!lastPrev || lastPrev.weight !== prevToday.weight)) weight = prevToday.weight;
  if (!lastSame && prevToday) {
    weight = prevToday.weight;
    reps = prevToday.reps ?? reps;
  }
  return { weight, reps };
}

/** "135 x 8", "8 reps" for bodyweight, "135" with no reps. Empty when blank. */
export function formatSet(v: SetValues | null | undefined): string {
  if (!v || (v.weight === null && v.reps === null)) return "";
  const w = v.weight === null ? null : v.weight.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (w !== null && v.reps !== null) return `${w} x ${v.reps}`;
  if (w !== null) return w;
  return `${v.reps} reps`;
}

export interface WorkoutProgress {
  logged: number;
  total: number;
  complete: boolean;
}

/** Sets logged on `date` out of the sets the workout plans. Extra sets do not count. */
export function workoutProgress(workout: Pick<Workout, "exercises"> | null, logs: readonly SetLog[], date: DateStr): WorkoutProgress {
  if (!workout) return { logged: 0, total: 0, complete: false };
  let logged = 0;
  let total = 0;
  for (const e of workout.exercises) {
    total += e.sets;
    const done = new Set(setsOn(logs, e.name, date).filter((l) => l.set_number >= 1 && l.set_number <= e.sets).map((l) => l.set_number));
    logged += done.size;
  }
  return { logged, total, complete: total > 0 && logged >= total };
}

/** Total weight moved for an exercise session: sum of weight times reps. */
export function sessionVolume(sets: readonly SetValues[]): number {
  return sets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
}

/** Only lifting days have sets worth logging. */
export function isLoggable(workout: Pick<Workout, "kind" | "exercises"> | null): boolean {
  return !!workout && workout.kind === "lift" && workout.exercises.length > 0;
}
