"use client";

import { BigNumber, TrackStat, cn } from "@/components/ui";
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
  const left = remainingLabel(total, goal, "g");
  return (
    <TrackStat
      value={fmt(total)}
      unit="g"
      label={label}
      progress={ring.fill}
      attention={over}
      caption={left}
      captionTone={over ? "warn" : ring.state === "met" ? "done" : "quiet"}
      aria-label={`${label}: ${fmt(total)}g, ${left}`}
    />
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
