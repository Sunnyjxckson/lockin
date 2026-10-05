"use client";

import { Card, ProgressRing, cn } from "@/components/ui";
import { remainingFor, remainingLabel, ringFor, type Goal, type Goals, type Macros } from "@/lib/logic/body";
import { fmt } from "./format";

function targetLine(goal: Goal, unit: string): string {
  if (goal.min !== null && goal.max !== null) return `${fmt(goal.min)} to ${fmt(goal.max)} ${unit}`;
  if (goal.min !== null) return `${fmt(goal.min)}${unit === "kcal" ? " kcal" : unit} or more`;
  if (goal.max !== null) return `${fmt(goal.max)}${unit === "kcal" ? " kcal" : unit}`;
  return "No target";
}

function SmallRing({ label, total, goal, primary }: { label: string; total: number; goal: Goal; primary?: boolean }) {
  const ring = ringFor(total, goal);
  const over = ring.state === "over";
  const met = ring.state === "met";
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
      <ProgressRing value={ring.fill} size={78} stroke={7} tone={over ? "warn" : primary ? "accent" : "ink"} label={label}>
        <span className={cn("tnum text-[20px] leading-none font-bold tracking-[-0.03em]", met && "text-accent", over && "text-warn")}>
          {fmt(total)}
        </span>
      </ProgressRing>
      <span className="mt-2.5 text-[14px] font-semibold">{label}</span>
      <span className={cn("tnum mt-0.5 text-[13px]", over ? "text-warn" : met ? "text-accent" : "text-ink-3")}>
        {remainingLabel(total, goal, "g")}
      </span>
      <span className="tnum mt-0.5 text-[12px] text-ink-3">of {goal.min ?? goal.max ?? 0}g</span>
    </div>
  );
}

/** The day's four macros as rings, with what is left to eat. */
export function MacroRings({ totals, goals }: { totals: Macros; goals: Goals }) {
  const cal = ringFor(totals.calories, goals.calories);
  const rem = remainingFor(totals.calories, goals.calories);
  const over = cal.state === "over";
  const met = cal.state === "met";
  const big = over ? rem.over : met ? (rem.room ?? 0) : rem.left;
  const caption = cal.state === "none" ? "eaten" : over ? "kcal over" : met ? "kcal of room" : "kcal left";
  return (
    <Card className="animate-fade-in">
      <div className="flex items-center gap-5">
        <ProgressRing value={cal.fill} size={148} stroke={13} tone={over ? "warn" : "accent"} label="Calories">
          <div className="flex flex-col items-center">
            <span className={cn("t-num tnum leading-none", met && "text-accent", over && "text-warn")}>
              {fmt(cal.state === "none" ? totals.calories : big)}
            </span>
            <span className="mt-1.5 text-[12px] font-medium text-ink-3">{caption}</span>
          </div>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="t-label">Calories</p>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className="t-num-sm tnum">{fmt(totals.calories)}</span>
            <span className="text-[14px] text-ink-3">eaten</span>
          </p>
          <p className="t-sub tnum mt-1.5">Target {targetLine(goals.calories, "kcal")}</p>
          {met ? <p className="mt-1.5 text-[13px] font-semibold text-accent">In range</p> : null}
          {over ? <p className="mt-1.5 text-[13px] font-semibold text-warn">Past the top of the range</p> : null}
        </div>
      </div>
      <div className="mt-5 flex gap-2 border-t border-line pt-5">
        <SmallRing label="Protein" total={totals.protein} goal={goals.protein} primary />
        <SmallRing label="Carbs" total={totals.carbs} goal={goals.carbs} />
        <SmallRing label="Fat" total={totals.fat} goal={goals.fat} />
      </div>
    </Card>
  );
}
