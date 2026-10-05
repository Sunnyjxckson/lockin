"use client";

import { weightChart, type WeightPoint } from "@/lib/logic/body";
import { fmt } from "./format";

const BOX = { width: 350, height: 170, padLeft: 34, padRight: 14, padTop: 14, padBottom: 26 };

/**
 * Weigh-ins over a run of days. x is day 1 to the last day. Inline SVG.
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
  const chart = weightChart(series, lengthDays, BOX);
  const x0 = BOX.padLeft;
  const x1 = BOX.width - BOX.padRight;
  const yBase = BOX.height - BOX.padBottom;
  const xOfDay = (d: number) => x0 + ((d - 1) / Math.max(1, lengthDays - 1)) * (x1 - x0);
  const mid = Math.round(lengthDays / 2);
  const last = chart.points[chart.points.length - 1];
  const area = chart.points.length > 1 ? `${chart.path} L${last.x} ${yBase} L${chart.points[0].x} ${yBase} Z` : "";
  const summary = series.map((p) => `${label(p.day)} ${fmt(p.weight, 1)} ${unit}`).join(", ");
  return (
    <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="block h-auto w-full" role="img" aria-label={`Weight by day: ${summary}`}>
      <defs>
        <linearGradient id="weight-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {chart.ticks.map((t) => (
        <g key={t.y}>
          <line x1={x0} x2={x1} y1={t.y} y2={t.y} stroke="var(--line)" strokeWidth="1" />
          <text x={x0 - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)" style={{ fontVariantNumeric: "tabular-nums" }}>
            {fmt(t.value)}
          </text>
        </g>
      ))}
      {todayDay !== null && todayDay >= 1 && todayDay <= lengthDays ? (
        <line x1={xOfDay(todayDay)} x2={xOfDay(todayDay)} y1={BOX.padTop} y2={yBase} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 4" />
      ) : null}
      {[1, mid, lengthDays].map((d, i) => (
        <text key={d} x={xOfDay(d)} y={BOX.height - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fontSize="11" fill="var(--ink-3)">
          {label(d)}
        </text>
      ))}
      {area ? <path d={area} fill="url(#weight-fill)" /> : null}
      {chart.path ? <path d={chart.path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {chart.points.map((p, i) => {
        const isLast = i === chart.points.length - 1;
        return (
          <circle
            key={p.date}
            cx={p.x}
            cy={p.y}
            r={isLast ? 5 : 3.5}
            fill={isLast ? "var(--accent)" : "var(--surface)"}
            stroke="var(--accent)"
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
}
