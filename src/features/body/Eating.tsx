"use client";

import { BigNumber, cn } from "@/components/ui";
import { remainingFor, remainingLabel, ringFor, type Goal, type Goals, type Macros } from "@/lib/logic/body";
import { fmt } from "./format";

export function targetLine(goal: Goal, unit: string): string {
  if (goal.min !== null && goal.max !== null) return `${fmt(goal.min)} to ${fmt(goal.max)} ${unit}`;
  if (goal.min !== null) return `${fmt(goal.min)} ${unit} or more`;
  if (goal.max !== null) return `${fmt(goal.max)} ${unit}`;
  return "No target";
}

/** The one number the day's eating leads with: what is left, the room before the cap, or how far over. */
export function CaloriesHero({ totals, goals }: { totals: Macros; goals: Goals }) {
  const cal = ringFor(totals.calories, goals.calories);
  const rem = remainingFor(totals.calories, goals.calories);
  const over = cal.state === "over";
  const met = cal.state === "met";
  const none = cal.state === "none";
  const value = none ? totals.calories : over ? rem.over : met ? (rem.room ?? 0) : rem.left;
  const label = none ? "Eaten" : over ? "Over the range" : met ? "In range, room left" : "Left to eat";
  return (
    <BigNumber
      label={<span className={cn(over && "text-warn", met && "text-accent")}>{label}</span>}
      value={fmt(value)}
      unit="kcal"
      sub={none ? "No calorie target set." : `Target ${targetLine(goals.calories, "kcal")}.`}
    />
  );
}

function MacroStat({ label, total, goal }: { label: string; total: number; goal: Goal }) {
  const ring = ringFor(total, goal);
  const over = ring.state === "over";
  const met = ring.state === "met";
  return (
    <div className="min-w-0" role="group" aria-label={`${label}: ${fmt(total)}g, ${remainingLabel(total, goal, "g")}`}>
      <span className="t-stat block truncate text-ink">
        {fmt(total)}
        <span className="text-[14px] font-normal tracking-normal text-ink-2">g</span>
      </span>
      <span className="t-label mt-1.5 block truncate text-[10px]">{label}</span>
      <span className="mt-2 block h-0.5 overflow-hidden rounded-full bg-hair" aria-hidden>
        <span className={cn("block h-full rounded-full", over ? "bg-warn" : "bg-accent")} style={{ width: `${ring.fill * 100}%`, transition: "width 600ms var(--ease-out)" }} />
      </span>
      <span className={cn("t-caption mt-2 block truncate", over ? "text-warn" : met ? "text-accent" : "text-ink-2")}>{remainingLabel(total, goal, "g")}</span>
    </div>
  );
}

/** Protein, carbs and fat as three quiet stats with a hairline each. */
export function MacroStats({ totals, goals }: { totals: Macros; goals: Goals }) {
  return (
    <div className="grid grid-cols-3 gap-3.5 px-1">
      <MacroStat label="Protein" total={totals.protein} goal={goals.protein} />
      <MacroStat label="Carbs" total={totals.carbs} goal={goals.carbs} />
      <MacroStat label="Fat" total={totals.fat} goal={goals.fat} />
    </div>
  );
}
