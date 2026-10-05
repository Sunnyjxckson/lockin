"use client";

// This week, one bar a day, with the daily goal drawn as a line. Hand drawn
// SVG, colored from the theme tokens. The accent only marks a day that
// reached the goal.

import { useId } from "react";
import { formatDuration } from "@/lib/logic/dates";
import type { WeekDay } from "@/lib/logic/focus";

const W = 320;
const H = 124;
const TOP = 20;
const BASE = 96;
const SLOT = W / 7;
const BAR = 10;

function short(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}` : `${m}m`;
}

export function WeekChart({ days, goal }: { days: readonly WeekDay[]; goal: number }) {
  const id = useId();
  const max = Math.max(goal, ...days.map((d) => d.minutes), 30);
  const y = (m: number) => BASE - (m / max) * (BASE - TOP);
  const total = days.reduce((n, d) => n + d.minutes, 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Focus this week: ${formatDuration(total)} in total. Daily goal ${formatDuration(goal)}.`}>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      {/* the goal: the one line on the chart */}
      {goal > 0 ? <line x1={0} x2={W} y1={y(goal)} y2={y(goal)} stroke="var(--hair)" strokeWidth={1} /> : null}
      {days.map((d, i) => {
        const cx = i * SLOT + SLOT / 2;
        const h = Math.max(BAR, BASE - y(d.minutes));
        return (
          <g key={d.date}>
            {d.minutes > 0 ? (
              <>
                <rect x={cx - BAR / 2} y={BASE - h} width={BAR} height={h} rx={BAR / 2} fill={d.met ? `url(#${id})` : "var(--ink-3)"} />
                <text x={cx} y={BASE - h - 7} textAnchor="middle" fontSize={11} fill={d.today ? "var(--ink)" : "var(--ink-2)"}>
                  {short(d.minutes)}
                </text>
              </>
            ) : d.future ? null : (
              <circle cx={cx} cy={BASE - 2} r={2} fill="var(--ink-3)" />
            )}
            <text x={cx} y={H - 6} textAnchor="middle" fontSize={12} fontWeight={d.today ? 500 : 400} fill={d.today ? "var(--ink)" : "var(--ink-2)"}>
              {d.letter}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default WeekChart;
