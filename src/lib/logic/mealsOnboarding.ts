// Food onboarding rules. Pure.

import type { PlanPrefs } from "./mealsPlanner";

/** Weeknight cooking time choices, in minutes. 60 means 60 or more. */
export const COOK_OPTIONS: readonly number[] = [15, 30, 45, 60];
export const DEFAULT_COOK_MINUTES = 30;

export function cookLabel(minutes: number): string {
  return minutes >= 60 ? "60+ min" : `${minutes} min`;
}

/** The nearest allowed cooking time, so a stray saved value still lands on a choice. */
export function cleanCookMinutes(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : DEFAULT_COOK_MINUTES;
  return COOK_OPTIONS.reduce((best, o) => (Math.abs(o - n) < Math.abs(best - n) ? o : best), COOK_OPTIONS[0]);
}

/**
 * Recipes carry no cook time yet, only tags ("quick", "nocook"). Until they
 * do, a short evening leans the planner toward those tags. 45 minutes and up
 * asks for nothing extra.
 */
export function cookPrefs(minutes: number | null | undefined): PlanPrefs | undefined {
  const m = cleanCookMinutes(minutes);
  if (m <= 15) return { boost: ["quick", "nocook"] };
  if (m <= 30) return { boost: ["quick"] };
  return undefined;
}

/** Merge the cook time lean into a request's prefs. The request's own words come first. */
export function withCookPrefs(prefs: PlanPrefs | undefined, minutes: number | null | undefined): PlanPrefs | undefined {
  const cook = cookPrefs(minutes);
  if (!cook) return prefs;
  if (!prefs) return cook;
  return { ...prefs, boost: [...new Set([...(prefs.boost ?? []), ...(cook.boost ?? [])])] };
}

/** First run: no plan at all and the questions were never answered or skipped. */
export function needsFoodOnboarding(onboarded: boolean | null | undefined, hasAnyPlan: boolean): boolean {
  return !onboarded && !hasAnyPlan;
}

/** Lower case, trimmed, no empty or repeated entries. */
export function cleanTerms(terms: readonly string[]): string[] {
  return [...new Set(terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0 && t.length <= 30))];
}

/** Starting points for what is at home, as chips. */
export const PANTRY_IDEAS = ["rice", "pasta", "oats", "eggs", "olive oil", "butter", "garlic", "onion", "flour", "peanut butter", "canned beans", "frozen vegetables"];
