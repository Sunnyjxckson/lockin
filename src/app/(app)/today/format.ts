import type { Exercise } from "@/lib/types";

export function formatNumber(n: number, maxDecimals = 1): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

/** "4 x 6 to 8" or, for a single set, just "10 min". */
export function formatSets(e: Exercise): string {
  return e.sets > 1 ? `${e.sets} x ${e.reps}` : e.reps;
}
