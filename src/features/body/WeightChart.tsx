"use client";

import { useId } from "react";
import { weightChart, type WeightPoint } from "@/lib/logic/body";
import { fmt } from "./format";

const BOX = { width: 350, height: 150, padLeft: 6, padRight: 6, padTop: 12, padBottom: 26 };

/**
 * Weigh-ins over a run of days, as one thin line. x is day 1 to the last day.
 * `label` names a day on the axis: "Day 12" by default, a date outside a challenge.
 */
export function WeightChart({
  series,
  lengthDays,
  todayDay,
  unit,
  label = (d) => `Day ${d}`,
}: {
  series: WeightPoint[];
  lengthDays: number;
  todayDay: number | null;
  unit: string;
  label?: (day: number) => string;
}) {
  const id = useId();
  const chart = weightChart(series, lengthDays, BOX);
  const x0 = BOX.padLeft;
  const x1 = BOX.width - BOX.padRight;
  const yBase = BOX.height - BOX.padBottom;
  const xOfDay = (d: number) => x0 + ((d - 1) / Math.max(1, lengthDays - 1)) * (x1 - x0);
  const mid = Math.round(lengthDays / 2);
  const summary = series.map((p) => `${label(p.day)} ${fmt(p.weight, 1)} ${unit}`).join(", ");
  const showToday = todayDay !== null && todayDay >= 1 && todayDay <= lengthDays;
  return (
    <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="block h-auto w-full" role="img" aria-label={`Weight by day: ${summary}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <line x1={x0} x2={x1} y1={yBase} y2={yBase} stroke="var(--hair)" strokeWidth="1" />
      {showToday ? <line x1={xOfDay(todayDay)} x2={xOfDay(todayDay)} y1={yBase - 5} y2={yBase} stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" /> : null}
      {[1, mid, lengthDays].map((d, i) => (
        <text key={d} x={xOfDay(d)} y={BOX.height - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fontSize="12" fill="var(--ink-2)">
          {label(d)}
        </text>
      ))}
      {chart.path ? <path d={chart.path} fill="none" stroke={`url(#${id})`} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {chart.points.map((p, i) => {
        const isLast = i === chart.points.length - 1;
        return <circle key={p.date} cx={p.x} cy={p.y} r={isLast ? 4.5 : 2} fill={isLast ? "var(--accent-2)" : "var(--accent)"} />;
      })}
    </svg>
  );
}
