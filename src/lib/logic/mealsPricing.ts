// Where prices come from. Everything that needs a price asks a PriceSource,
// so a live integration (Instacart, a store API) can replace the estimates by
// implementing the same interface.
//
// Until then every number is an ESTIMATE: the food table's typical pack price
// scaled by how each chain usually prices each part of the store. A price the
// user typed from a receipt replaces the estimate for that item at that store.

import { GROCERY_STORES } from "../types";
import { foodKey, round, type Food, type Section } from "./meals";

export type Store = (typeof GROCERY_STORES)[number];
export const STORES: readonly Store[] = GROCERY_STORES;
export const DEFAULT_STORE: Store = "Aldi";

export function isStore(s: unknown): s is Store {
  return typeof s === "string" && (STORES as readonly string[]).includes(s);
}

export interface PriceQuote {
  /** Dollars for one pack. */
  price: number;
  /** "estimate": worked out, not a real shelf price. "receipt": the user typed it in. "live": from a store integration. */
  source: "estimate" | "receipt" | "live";
}

export interface PriceSource {
  /** Shown beside totals: "Estimated prices". */
  label: string;
  /** False only when every quote is a real price. */
  estimated: boolean;
  quote(food: Food, store: Store): PriceQuote;
}

/**
 * Rough price level of each chain by part of the store, where 1 is the food
 * table's price. Discount grocers run lowest, the full service chains
 * highest. These are judgment calls, not measured data.
 */
const LEVEL: Record<Store, Partial<Record<Section, number>> & { all: number }> = {
  Aldi: { all: 0.84, meat: 0.9, dairy: 0.8, produce: 0.82 },
  Walmart: { all: 0.9, meat: 0.94, produce: 0.92 },
  "Food Lion": { all: 1 },
  "Harris Teeter": { all: 1.17, meat: 1.2, produce: 1.15 },
  Publix: { all: 1.14, meat: 1.18, produce: 1.12 },
};

export function storeLevel(store: Store, section: Section): number {
  const l = LEVEL[store];
  return l[section] ?? l.all;
}

export const estimateSource: PriceSource = {
  label: "Estimated prices",
  estimated: true,
  quote(food, store) {
    return { price: round(food.price * storeLevel(store, food.section), 2), source: "estimate" };
  },
};

/** Receipt prices: dollars per pack by food name, then by store. */
export type Corrections = Record<string, Partial<Record<string, number>>>;

/** A source that prefers the user's receipt prices and falls back to `base`. */
export function withCorrections(base: PriceSource, corrections: Corrections): PriceSource {
  return {
    label: base.label,
    estimated: base.estimated,
    quote(food, store) {
      const own = corrections[foodKey(food.name)]?.[store];
      if (typeof own === "number" && Number.isFinite(own) && own >= 0) return { price: round(own, 2), source: "receipt" };
      return base.quote(food, store);
    },
  };
}

/** Pack price lookup for one store, the shape the planner and the list take. */
export type PackPrices = (food: Food) => number;

export function pricesAt(source: PriceSource, store: Store): PackPrices {
  return (food) => source.quote(food, store).price;
}

export const basePrices: PackPrices = (food) => food.price;
