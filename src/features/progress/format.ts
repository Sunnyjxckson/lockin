import type { ItemResult } from "@/lib/logic/day";
import { describeTarget } from "@/lib/logic/targets";

export function formatValue(n: number, unit: string | null): string {
  const s = n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (!unit) return s;
  if (unit === "$") return `$${s}`;
  return unit.length <= 2 ? `${s}${unit}` : `${s} ${unit}`;
}

/** The second line for one item in the day sheet: what was logged and what it needed. */
export function resultDetail(r: ItemResult): string {
  const target = describeTarget(r.target, r.item.unit);
  const value = r.log?.value;
  const numeric = r.target.kind === "min" || r.target.kind === "max" || r.target.kind === "range";
  if (r.done) {
    if (numeric && value !== null && value !== undefined) return formatValue(value, r.item.unit);
    if (r.target.kind === "text" && r.log?.text) return r.log.text;
    return "";
  }
  if (r.state === "off") {
    if (numeric && value !== null && value !== undefined) return `Logged ${formatValue(value, r.item.unit)}. Needed ${target}`;
    if (r.target.kind === "check_by") return "Checked after the cutoff";
    if (r.target.kind === "text") return r.log?.checked ? "Checked with nothing written" : "Written but not checked";
    return "Logged, did not count";
  }
  if (numeric) return `Nothing logged. Needed ${target}`;
  return "";
}
