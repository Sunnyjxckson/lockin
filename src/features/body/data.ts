// Reads and writes for the Body feature. Everything goes through the
// foundation's db and helpers. After any meal change the day's calorie and
// protein totals are written to the checklist so Today scores them.

import { db } from "@/lib/db";
import { logWeight, setValueByKey } from "@/lib/db/helpers";
import { removePhoto, uploadPhoto } from "@/lib/storage";
import { mealTotals, type Macros } from "@/lib/logic/body";
import { timeNY } from "@/lib/logic/dates";
import { sameExercise } from "@/lib/logic/workout";
import type { DateStr, Meal, SavedMeal } from "@/lib/types";

export interface MealInput extends Macros {
  name: string | null;
  photo_url?: string | null;
}

/** Push the day's totals to the Calories and Protein checklist items. */
export async function syncDayTotals(date: DateStr): Promise<Macros> {
  const meals = await db.list("meal", { eq: { date } });
  const totals = mealTotals(meals);
  const none = meals.length === 0;
  await setValueByKey("calories", date, none ? null : Math.round(totals.calories));
  await setValueByKey("protein", date, none ? null : Math.round(totals.protein));
  return totals;
}

function tidy(input: MealInput) {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : 0);
  const name = input.name?.trim() ?? "";
  return {
    name: name.length > 0 ? name : null,
    calories: n(input.calories),
    protein: n(input.protein),
    carbs: n(input.carbs),
    fat: n(input.fat),
  };
}

export async function addMeal(date: DateStr, input: MealInput): Promise<Meal> {
  const meal = await db.insert("meal", { date, time: timeNY(), photo_url: input.photo_url ?? null, ...tidy(input) });
  await syncDayTotals(date);
  return meal;
}

export async function updateMeal(meal: Meal, input: MealInput): Promise<Meal> {
  const next = await db.update("meal", meal.id, {
    ...tidy(input),
    ...(input.photo_url !== undefined ? { photo_url: input.photo_url } : {}),
  });
  await syncDayTotals(meal.date);
  return next;
}

/** A photo is only deleted when no other meal or favorite still points at it. */
async function dropPhotoIfUnused(ref: string | null): Promise<void> {
  if (!ref) return;
  const [meals, saved] = await Promise.all([db.list("meal", { eq: { photo_url: ref } }), db.list("saved_meal", { eq: { photo_url: ref } })]);
  if (meals.length === 0 && saved.length === 0) await removePhoto(ref).catch(() => undefined);
}

export async function deleteMeal(meal: Meal): Promise<void> {
  await db.remove("meal", meal.id);
  await syncDayTotals(meal.date);
  await dropPhotoIfUnused(meal.photo_url);
}

export function storeMealPhoto(file: Blob): Promise<string> {
  return uploadPhoto(file, { folder: "meals", maxSize: 1280 });
}

// ---------- favorites ----------

export async function findSaved(name: string | null): Promise<SavedMeal | null> {
  if (!name) return null;
  const all = await db.list("saved_meal");
  return all.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;
}

/** Save a meal as a favorite. A favorite with the same name is updated. */
export async function saveFavorite(input: MealInput): Promise<SavedMeal> {
  const t = tidy(input);
  const name = t.name ?? "Meal";
  const existing = await findSaved(name);
  const row = { ...t, name, photo_url: input.photo_url ?? existing?.photo_url ?? null };
  if (existing) return db.update("saved_meal", existing.id, row);
  return db.insert("saved_meal", { ...row, use_count: 0 });
}

export async function removeFavorite(saved: SavedMeal): Promise<void> {
  await db.remove("saved_meal", saved.id);
  await dropPhotoIfUnused(saved.photo_url);
}

/** Log a favorite on a date in one step. */
export async function logFavorite(saved: SavedMeal, date: DateStr): Promise<Meal> {
  const meal = await addMeal(date, saved);
  await db.update("saved_meal", saved.id, { use_count: (saved.use_count ?? 0) + 1 });
  return meal;
}

// ---------- weight and progress photos ----------

/** Save a weigh-in, with or without a photo. Weight goes through logWeight. */
export async function saveWeighIn(date: DateStr, weight: number | null, photo?: Blob | null): Promise<void> {
  const prev = await db.first("body_log", { eq: { date } });
  if (weight !== (prev?.weight ?? null) || !prev) await logWeight(date, weight);
  if (photo) {
    const ref = await uploadPhoto(photo, { folder: "body", maxSize: 1600 });
    const row = await db.first("body_log", { eq: { date } });
    await db.upsert("body_log", { date, weight: row?.weight ?? weight, photo_url: ref }, ["date"]);
    if (prev?.photo_url && prev.photo_url !== ref) await removePhoto(prev.photo_url).catch(() => undefined);
  }
}

export async function removeProgressPhoto(date: DateStr): Promise<void> {
  const row = await db.first("body_log", { eq: { date } });
  if (!row?.photo_url) return;
  await db.update("body_log", row.id, { photo_url: null });
  await removePhoto(row.photo_url).catch(() => undefined);
}

export async function removeWeighIn(date: DateStr): Promise<void> {
  const row = await db.first("body_log", { eq: { date } });
  if (!row) return;
  await logWeight(date, null);
  if (!row.photo_url) await db.remove("body_log", row.id);
}

// ---------- sets ----------

export async function logSet(date: DateStr, exercise: string, setNumber: number, weight: number | null, reps: number | null): Promise<void> {
  await db.upsert("set_log", { date, exercise, set_number: setNumber, weight, reps }, ["date", "exercise", "set_number"]);
}

export async function clearSet(date: DateStr, exercise: string, setNumber: number): Promise<void> {
  const rows = await db.list("set_log", { eq: { date, set_number: setNumber } });
  for (const r of rows) if (sameExercise(r.exercise, exercise)) await db.remove("set_log", r.id);
}
