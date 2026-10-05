"use client";

// This week, one bar a day, with the daily goal drawn as a line. Hand drawn
// SVG, colored from the theme tokens. The accent only marks a day that
// reached the goal.

import { formatDuration } from "@/lib/logic/dates";
import type { WeekDay } from "@/lib/logic/focus";

const W = 320;
const H = 132;
const TOP = 18;
const BASE = 104;
const SLOT = W / 7;
const BAR = 26;

export function WeekChart({ days, goal }: { days: readonly WeekDay[]; goal: number }) {
  const max = Math.max(goal, ...days.map((d) => d.minutes), 30);
  const y = (m: number) => BASE - (m / max) * (BASE - TOP);
  const total = days.reduce((n, d) => n + d.minutes, 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Focus this week: ${formatDuration(total)} in total. Daily goal ${formatDuration(goal)}.`}>
      <line x1={0} x2={W} y1={BASE} y2={BASE} stroke="var(--line)" strokeWidth={1} />
      {days.map((d, i) => {
        const cx = i * SLOT + SLOT / 2;
        const top = y(d.minutes);
        const h = Math.max(d.minutes > 0 ? 3 : 0, BASE - top);
        return (
          <g key={d.date}>
            {d.minutes > 0 ? (
              <>
                <rect x={cx - BAR / 2} y={BASE - h} width={BAR} height={h} rx={6} fill={d.met ? "var(--accent)" : "var(--ink-3)"} />
                <text x={cx} y={BASE - h - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink-2)" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {d.minutes >= 60 ? `${Math.floor(d.minutes / 60)}h${d.minutes % 60 ? ` ${d.minutes % 60}` : ""}` : `${d.minutes}m`}
                </text>
              </>
            ) : d.future ? null : (
              <rect x={cx - BAR / 2} y={BASE - 3} width={BAR} height={3} rx={1.5} fill="var(--surface-3)" />
            )}
            <text x={cx} y={H - 8} textAnchor="middle" fontSize={12} fontWeight={d.today ? 700 : 500} fill={d.today ? "var(--ink)" : "var(--ink-3)"}>
              {d.letter}
            </text>
            {d.today ? <circle cx={cx} cy={H - 2} r={1.5} fill="var(--ink)" /> : null}
          </g>
        );
      })}
      {goal > 0 ? <line x1={0} x2={W} y1={y(goal)} y2={y(goal)} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 4" /> : null}
    </svg>
  );
}

export default WeekChart;
