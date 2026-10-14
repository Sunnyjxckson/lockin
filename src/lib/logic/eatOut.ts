// Eat out: given what is left of the day, pick the best few restaurant
// orders from the static chain data (src/data/restaurants/chains.json).
// Pure. No db, no React.
//
// Rules: the order must fit under the calories left, it should cover the
// protein still needed (more is not better past that), and when two orders
// are close on protein the cheaper one wins. Build your own chains (Chipotle,
// Subway) get orders assembled from the chain's own components in a bounded
// search. Components the person dislikes are never used.

import type { MealSlot } from "../types";

export interface Macro {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** One component or menu item, with its published numbers. Price is an estimate. */
export interface Part extends Macro {
  name: string;
  /** Extra dollars for build your own parts. The full price for a menu item or a protein entree. */
  price: number;
  /** At most one topping of a group (cheese, sauce, salsa). */
  group?: string;
  /** Menu items only: the slots it suits. Missing means the chain's slots. */
  slots?: MealSlot[];
}

export interface Chain {
  id: string;
  name: string;
  kind: "build" | "menu";
  slots: MealSlot[];
  source_url: string;
  checked: string;
  note?: string;
  price_estimate: boolean;
  /** Build chains. */
  entree?: string;
  /** What the order is called with a base on it (a sub on bread). Missing means `entree`. */
  base_entree?: string;
  no_base_label?: string;
  double_extra?: number;
  max_toppings?: number;
  proteins?: Part[];
  bases?: Part[];
  toppings?: Part[];
  /** Menu chains. */
  items?: Part[];
  sides?: Part[];
}

export interface ChainData {
  updated: string;
  chains: Chain[];
}

/** What is left to fill. */
export interface Remaining {
  /** Lowest and highest kcal that still keep the day on target. calMax below zero means nothing is left. */
  calMin: number;
  calMax: number;
  /** Grams of protein still needed. Zero or less means the target is met. */
  protein: number;
}

export interface EatOutOrder extends Macro {
  /** chain id plus the parts, stable between runs. */
  id: string;
  chainId: string;
  chain: string;
  /** The order in plain words. */
  title: string;
  /** One line per part, for the receipt style view. */
  lines: string[];
  /** Dollars before tax. An estimate. */
  subtotal: number;
  /** Dollars with sales tax. An estimate. */
  price: number;
  /** True when the calories land inside calMin to calMax. */
  inRange: boolean;
  source_url: string;
}

/**
 * NC state sales tax is 4.75 percent and Mecklenburg County adds 2.5, so
 * 7.25 percent. Charlotte also has a 1 percent prepared food and beverage
 * tax that this leaves out, which is why every price is called an estimate.
 */
export const MECKLENBURG_TAX = 0.0725;

const round = (n: number, d = 0): number => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

const lower = (s: string): string => s.toLowerCase();

/** True when a dislike (a food word) appears in a component name. */
export function isDisliked(name: string, dislikes: readonly string[]): boolean {
  const n = lower(name);
  return dislikes.some((d) => {
    const w = lower(d).trim();
    return w.length > 1 && n.includes(w);
  });
}

function sum(parts: readonly { m: Macro; times: number }[]): Macro {
  const out: Macro = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const { m, times } of parts) {
    out.calories += m.calories * times;
    out.protein += m.protein * times;
    out.carbs += m.carbs * times;
    out.fat += m.fat * times;
  }
  return out;
}

interface Draft extends Macro {
  chain: Chain;
  key: string;
  title: string;
  lines: string[];
  subtotal: number;
}

function* subsets(parts: readonly Part[], max: number, start = 0, picked: Part[] = []): Generator<Part[]> {
  yield picked;
  if (picked.length >= max) return;
  for (let i = start; i < parts.length; i++) {
    const p = parts[i];
    if (p.group && picked.some((x) => x.group === p.group)) continue;
    yield* subsets(parts, max, i + 1, [...picked, p]);
  }
}

function buildDrafts(chain: Chain, dislikes: readonly string[]): Draft[] {
  const proteins = (chain.proteins ?? []).filter((p) => !isDisliked(p.name, dislikes));
  const bases: (Part | null)[] = [null, ...(chain.bases ?? []).filter((b) => !isDisliked(b.name, dislikes))];
  const toppings = (chain.toppings ?? []).filter((t) => !isDisliked(t.name, dislikes));
  const maxTop = chain.max_toppings ?? 3;
  const entree = chain.entree ?? "bowl";
  const out: Draft[] = [];
  const combos = [...subsets(toppings, maxTop)];
  for (const protein of proteins) {
    for (const times of [1, 2]) {
      for (const base of bases) {
        for (const tops of combos) {
          const m = sum([
            { m: protein, times },
            ...(base ? [{ m: base, times: 1 }] : []),
            ...tops.map((t) => ({ m: t, times: 1 })),
          ]);
          const subtotal = protein.price + (times === 2 ? (chain.double_extra ?? 0) : 0) + (base?.price ?? 0) + tops.reduce((a, t) => a + t.price, 0);
          const head = `${times === 2 ? "Double " : ""}${lower(protein.name)} ${base ? (chain.base_entree ?? entree) : entree}`;
          const withs = [...tops.map((t) => lower(t.name)), base ? lower(base.name) : chain.no_base_label ?? ""].filter(Boolean);
          const lines = [
            `${times === 2 ? "Double " : ""}${protein.name}`,
            ...(base ? [base.name] : []),
            ...tops.map((t) => t.name),
          ];
          out.push({
            ...m,
            chain,
            key: [protein.name, times, base?.name ?? "-", ...tops.map((t) => t.name)].join("|"),
            title: withs.length > 0 ? `${head}: ${withs.join(", ")}` : head,
            lines,
            subtotal,
          });
        }
      }
    }
  }
  return out;
}

function menuDrafts(chain: Chain, slot: MealSlot, dislikes: readonly string[]): Draft[] {
  const items = (chain.items ?? []).filter((i) => (i.slots ?? chain.slots).includes(slot) && !isDisliked(i.name, dislikes));
  const sides: (Part | null)[] = [null, ...(chain.sides ?? []).filter((s) => !isDisliked(s.name, dislikes))];
  const out: Draft[] = [];
  for (const item of items) {
    for (const side of sides) {
      const m = sum([{ m: item, times: 1 }, ...(side ? [{ m: side, times: 1 }] : [])]);
      out.push({
        ...m,
        chain,
        key: `${item.name}|${side?.name ?? "-"}`,
        title: side ? `${item.name} with ${lower(side.name)}` : item.name,
        lines: [item.name, ...(side ? [side.name] : [])],
        subtotal: item.price + (side?.price ?? 0),
      });
    }
  }
  return out;
}

export interface FindOptions {
  remaining: Remaining;
  slot: MealSlot;
  chains: readonly Chain[];
  dislikes?: readonly string[];
  /** How many orders to return. Default 5. */
  limit?: number;
  taxRate?: number;
}

/** Orders below this share of the calories left are not a meal (a snack is exempt). */
const MIN_SHARE = 0.4;
const MIN_FLOOR_CAP = 450;
const MIN_FLOOR_MIN = 150;
/** Protein within this many grams counts as a tie, and the cheaper order wins. */
const PROTEIN_TIE = 2;

function toOrder(d: Draft, remaining: Remaining, taxRate: number): EatOutOrder {
  const subtotal = round(d.subtotal, 2);
  return {
    id: `${d.chain.id}:${d.key}`,
    chainId: d.chain.id,
    chain: d.chain.name,
    title: d.title,
    lines: d.lines,
    calories: round(d.calories),
    protein: round(d.protein, 1),
    carbs: round(d.carbs, 1),
    fat: round(d.fat, 1),
    subtotal,
    price: round(subtotal * (1 + taxRate), 2),
    inRange: d.calories >= remaining.calMin && d.calories <= remaining.calMax,
    source_url: d.chain.source_url,
  };
}

/**
 * The best few orders. Best per chain first so the list is not five bowls
 * from one place, then the runners up.
 */
export function findOrders(opts: FindOptions): EatOutOrder[] {
  const { remaining, slot, chains } = opts;
  const dislikes = opts.dislikes ?? [];
  const limit = opts.limit ?? 5;
  const taxRate = opts.taxRate ?? MECKLENBURG_TAX;
  if (!(remaining.calMax > 0)) return [];
  const floor = slot === "snack" ? 0 : Math.min(Math.max(remaining.calMax * MIN_SHARE, MIN_FLOOR_MIN), MIN_FLOOR_CAP);
  const need = Math.max(0, remaining.protein);

  const better = (a: Draft, b: Draft): number => {
    const ca = Math.min(a.protein, need);
    const cb = Math.min(b.protein, need);
    if (Math.abs(ca - cb) > PROTEIN_TIE) return cb - ca;
    // Inside the range beats under the range at the same protein.
    const ia = a.calories >= remaining.calMin ? 0 : 1;
    const ib = b.calories >= remaining.calMin ? 0 : 1;
    if (ia !== ib) return ia - ib;
    if (Math.abs(a.subtotal - b.subtotal) > 0.004) return a.subtotal - b.subtotal;
    return b.protein - a.protein || a.calories - b.calories || a.key.localeCompare(b.key);
  };

  const perChain: Draft[][] = [];
  for (const chain of chains) {
    if (!chain.slots.includes(slot)) continue;
    const drafts = chain.kind === "build" ? buildDrafts(chain, dislikes) : menuDrafts(chain, slot, dislikes);
    const fits = drafts.filter((d) => d.calories <= remaining.calMax && d.calories >= floor).sort(better);
    // Keep distinct main parts: the same protein with a different side sauce is not a new idea.
    const seen = new Set<string>();
    const kept: Draft[] = [];
    for (const d of fits) {
      const idea = d.lines[0];
      if (seen.has(idea)) continue;
      seen.add(idea);
      kept.push(d);
      if (kept.length >= 3) break;
    }
    if (kept.length > 0) perChain.push(kept);
  }

  const picks: Draft[] = [];
  for (let round_ = 0; picks.length < limit && round_ < 3; round_++) {
    const layer = perChain.map((l) => l[round_]).filter((d): d is Draft => !!d).sort(better);
    for (const d of layer) if (picks.length < limit) picks.push(d);
  }
  return picks.sort(better).map((d) => toOrder(d, remaining, taxRate));
}

// ---------- what is left today ----------

export interface DayState {
  /** The day's targets. */
  calMin: number;
  calMax: number;
  proteinMin: number;
  /** Logged so far. */
  eatenCalories: number;
  eatenProtein: number;
  /** Other planned meals not yet eaten that day, at their planned portion. */
  plannedCalories: number;
  plannedProtein: number;
}

/**
 * What an eat out order has to fit: the day's targets minus what is logged
 * and minus the other planned meals still to come. The meal being replaced
 * is not in plannedCalories.
 */
export function remainingFor(day: DayState): Remaining {
  const used = day.eatenCalories + day.plannedCalories;
  return {
    calMin: Math.max(0, round(day.calMin - used)),
    calMax: Math.max(0, round(day.calMax - used)),
    protein: Math.max(0, round(day.proteinMin - day.eatenProtein - day.plannedProtein)),
  };
}

/** A plain word for the name of the meal row an order writes. */
export function mealName(order: Pick<EatOutOrder, "chain" | "title">): string {
  return `${order.chain}: ${order.title}`;
}

/** A Google Maps search link for the chain near the person. */
export function directionsUrl(chain: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(`${chain} near me`)}`;
}
