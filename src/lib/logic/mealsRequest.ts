// "More chicken, no fish, cheaper breakfasts" as planner inputs. The words
// only ever change what the planner is asked for (lean toward, leave out,
// which slots to economize, the budget). The plan itself and all of its math
// stay in the deterministic planner.
//
// parseRequest is the rule based reader, used with no API key. A model's
// answer goes through cleanRequest, which keeps only terms that exist in the
// library, so a model cannot invent a food or a recipe.

import type { MealSlot } from "../types";
import { matchesTerm, SLOTS, type Matchable } from "./meals";
import type { PlanPrefs, Variety } from "./mealsPlanner";

export interface PlanRequest {
  boost: string[];
  avoid: string[];
  cheaperSlots: MealSlot[];
  /** A new weekly budget, when one was named. */
  budget: number | null;
  variety: Variety | null;
  /** Words that matched nothing in the library, to tell the user. */
  unknown: string[];
}

export const EMPTY_REQUEST: PlanRequest = { boost: [], avoid: [], cheaperSlots: [], budget: null, variety: null, unknown: [] };

const SLOT_WORDS: Record<string, MealSlot> = {
  breakfast: "breakfast",
  breakfasts: "breakfast",
  morning: "breakfast",
  mornings: "breakfast",
  lunch: "lunch",
  lunches: "lunch",
  dinner: "dinner",
  dinners: "dinner",
  supper: "dinner",
  snack: "snack",
  snacks: "snack",
};

const AVOID = /^(?:no|not|without|skip|avoid|less|fewer|zero|drop|cut|remove|hold the|i hate|hate|i (?:do not|don't|dont) (?:like|want)|(?:do not|don't|dont) (?:like|want)|nothing with|not any)\s+(.+)$/;
const BOOST = /^(?:more|extra|add|lots of|plenty of|heavy on|i love|love|i like|like|i want|want|give me|include|lean on|mostly)\s+(.+)$/;
const CHEAP = /\b(?:cheap|cheaper|cheapest|budget|inexpensive|save money|low cost)\b/;
const FILLER = /\b(?:please|some|any|the|a|an|my|meals?|dishes?|recipes?|options?|food|foods|stuff|this week|for)\b/g;

function known(term: string, recipes: readonly Matchable[]): boolean {
  return recipes.some((r) => matchesTerm(r, term));
}

function tidy(term: string): string {
  return term.replace(FILLER, " ").replace(/\s+/g, " ").trim();
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list)];
}

/** Read a request with plain rules. Deterministic, works offline. */
export function parseRequest(text: string, recipes: readonly Matchable[]): PlanRequest {
  const out: PlanRequest = { boost: [], avoid: [], cheaperSlots: [], budget: null, variety: null, unknown: [] };
  const lower = text.toLowerCase().replace(/[\u2012-\u2015]/g, ",");
  const money = /(?:under|below|max|at most|budget(?: of| is)?|spend|for)\s*\$?\s*(\d{2,4})(?!\s*(?:g|kcal|cal))|\$\s*(\d{2,4})/.exec(lower);
  if (money) out.budget = Number(money[1] ?? money[2]);
  if (/\b(?:more variety|mix it up|different every|less repeat|fewer repeats|not the same)\b/.test(lower)) out.variety = "varied";
  if (/\b(?:less cooking|fewer recipes|simpler|simple week|meal prep|batch|cook once|less variety)\b/.test(lower)) out.variety = "batch";

  const clauses = lower
    .split(/[,;.\n]|\band\b|\bbut\b|\bplus\b/)
    .map((c) => c.trim())
    .filter(Boolean);
  let lastCheap = false;
  for (const clause of clauses) {
    const slotsHere = clause.split(/\s+/).map((w) => SLOT_WORDS[w]).filter(Boolean);
    if (CHEAP.test(clause)) {
      out.cheaperSlots.push(...(slotsHere.length > 0 ? slotsHere : SLOTS));
      lastCheap = slotsHere.length > 0;
      continue;
    }
    // "cheap lunches and dinners": the second half carries the first half's meaning.
    if (lastCheap && slotsHere.length > 0 && tidy(clause).split(" ").every((w) => w in SLOT_WORDS)) {
      out.cheaperSlots.push(...slotsHere);
      continue;
    }
    lastCheap = false;
    const avoid = AVOID.exec(clause);
    const boost = avoid ? null : BOOST.exec(clause);
    const body = avoid?.[1] ?? boost?.[1];
    if (!body) continue;
    for (const raw of body.split(/\bor\b|\/|&/)) {
      const term = tidy(raw);
      if (!term || /^\$?\d/.test(term) || term in SLOT_WORDS) continue;
      if (!known(term, recipes)) out.unknown.push(term);
      else if (avoid) out.avoid.push(term);
      else out.boost.push(term);
    }
  }
  out.boost = unique(out.boost).filter((t) => !out.avoid.includes(t));
  out.avoid = unique(out.avoid);
  out.cheaperSlots = unique(out.cheaperSlots);
  out.unknown = unique(out.unknown);
  return out;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase().trim()).filter(Boolean) : [];
}

/** Keep only what the planner can act on from a model's answer. Unknown terms are reported, not used. */
export function cleanRequest(raw: unknown, recipes: readonly Matchable[]): PlanRequest {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: PlanRequest = { boost: [], avoid: [], cheaperSlots: [], budget: null, variety: null, unknown: [] };
  for (const t of strings(r.avoid).slice(0, 12)) (known(t, recipes) ? out.avoid : out.unknown).push(t);
  for (const t of strings(r.boost).slice(0, 12)) (known(t, recipes) ? out.boost : out.unknown).push(t);
  out.cheaperSlots = unique(strings(r.cheaper_slots ?? r.cheaperSlots).filter((s): s is MealSlot => (SLOTS as readonly string[]).includes(s)));
  const b = typeof r.budget === "number" && Number.isFinite(r.budget) && r.budget > 0 && r.budget < 2000 ? Math.round(r.budget) : null;
  out.budget = b;
  out.variety = r.variety === "batch" || r.variety === "balanced" || r.variety === "varied" ? r.variety : null;
  out.unknown.push(...strings(r.unknown).slice(0, 12).filter((t) => !known(t, recipes)));
  out.boost = unique(out.boost).filter((t) => !out.avoid.includes(t));
  out.avoid = unique(out.avoid);
  out.unknown = unique(out.unknown);
  return out;
}

export function isEmptyRequest(r: PlanRequest): boolean {
  return r.boost.length === 0 && r.avoid.length === 0 && r.cheaperSlots.length === 0 && r.budget === null && r.variety === null;
}

export function toPrefs(r: PlanRequest): PlanPrefs {
  return { boost: r.boost, avoid: r.avoid, cheaperSlots: r.cheaperSlots, ...(r.variety ? { variety: r.variety } : {}) };
}

/** What was understood, to show before the week is rebuilt: "More chicken. No fish. Cheaper breakfasts." */
export function describeRequest(r: PlanRequest): string {
  const parts: string[] = [];
  if (r.boost.length > 0) parts.push(`More ${r.boost.join(", ")}.`);
  if (r.avoid.length > 0) parts.push(`No ${r.avoid.join(", ")}.`);
  if (r.cheaperSlots.length === SLOTS.length) parts.push("Cheaper all round.");
  else if (r.cheaperSlots.length > 0) parts.push(`Cheaper ${r.cheaperSlots.map((s) => (s === "lunch" ? "lunches" : `${s}s`)).join(", ")}.`);
  if (r.budget !== null) parts.push(`Budget $${r.budget}.`);
  if (r.variety === "varied") parts.push("More variety.");
  if (r.variety === "batch") parts.push("Fewer recipes, bigger batches.");
  if (r.unknown.length > 0) parts.push(`Nothing in the library matches ${r.unknown.join(", ")}.`);
  return parts.join(" ");
}
