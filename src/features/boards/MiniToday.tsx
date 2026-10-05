"use client";

// A miniature of the Today screen, drawn with the app's real token classes
// inside a box that carries its own theme variables. Whatever theme is handed
// in is what shows, without touching the app around it.

import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { cn } from "@/components/ui";
import { themeVars, type Theme } from "@/lib/logic/theme";

function Row({ label, value, done, warn }: { label: string; value?: string; done?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-[5px]">
      <span className={cn("flex size-[13px] shrink-0 items-center justify-center rounded-full border", done ? "border-accent bg-accent text-accent-ink" : "border-line-strong")}>
        {done ? <Check size={8} strokeWidth={4} aria-hidden /> : null}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-[8.5px] font-medium", done ? "text-ink-2" : "text-ink")}>{label}</span>
      {value ? <span className={cn("tnum rounded-[4px] px-1 py-px text-[7.5px] font-semibold", done ? "bg-accent-soft text-accent" : warn ? "bg-warn-soft text-warn" : "text-ink-3")}>{value}</span> : null}
    </div>
  );
}

export function MiniToday({ theme, className }: { theme: Theme; className?: string }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <div
      aria-hidden
      style={{ ...(themeVars(theme) as CSSProperties), colorScheme: theme.scheme }}
      className={cn("pointer-events-none flex w-[184px] shrink-0 flex-col overflow-hidden rounded-[20px] border border-line-strong bg-bg text-ink shadow-[0_10px_30px_var(--shadow)] select-none", className)}
    >
      <div className="flex items-center justify-between px-3 pt-3.5 pb-2">
        <div>
          <p className="text-[6.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Monday, Oct 5</p>
          <p className="mt-0.5 text-[17px] leading-none font-bold tracking-[-0.04em]">Day 12</p>
          <p className="mt-1 text-[7px] text-ink-2">of 30</p>
        </div>
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="4" />
          <circle cx="22" cy="22" r={r} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * 0.66} ${c}`} transform="rotate(-90 22 22)" />
          <text x="22" y="25" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--ink)">
            66%
          </text>
        </svg>
      </div>

      <div className="mx-2 rounded-[9px] border border-line bg-surface px-2 py-1.5">
        <p className="text-[6px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Now</p>
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-semibold tracking-[-0.01em]">Study block</p>
          <p className="tnum text-[7px] text-ink-2">42m left</p>
        </div>
        <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-surface-3">
          <div className="h-full w-[58%] rounded-full bg-ink" />
        </div>
      </div>

      <div className="mx-2 mt-1.5 divide-y divide-line overflow-hidden rounded-[9px] border border-line bg-surface">
        <Row label="Up by 6:00" done />
        <Row label="Workout" done />
        <Row label="Earned" value="$62" />
        <Row label="Protein" value="190g" done />
        <Row label="Calories" value="2,340" warn />
      </div>

      <div className="mx-2 mt-1.5 flex gap-1">
        <div className="flex h-[18px] flex-1 items-center justify-center rounded-[6px] bg-ink text-[7.5px] font-semibold text-bg">Add earnings</div>
        <div className="flex h-[18px] items-center justify-center rounded-[6px] border border-line bg-surface-2 px-2 text-[7.5px] font-semibold text-ink">Log sets</div>
      </div>

      <div className="mt-2 flex items-center justify-around border-t border-line px-2 py-1.5">
        {["Today", "Schedule", "Money", "Body", "Progress"].map((t, i) => (
          <span key={t} className={cn("text-[6px] font-semibold", i === 0 ? "text-ink" : "text-ink-3")}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
