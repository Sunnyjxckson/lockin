"use client";

// A miniature of the Today screen, drawn with the app's real surface
// utilities (glass, tile, grad) inside a box that carries its own theme
// variables. Whatever theme is handed in is what shows, lights and gradient
// included, without touching the app around it.

import type { CSSProperties } from "react";
import { cn } from "@/components/ui";
import { themeVars, type Theme } from "@/lib/logic/theme";

type TileKind = "off" | "done" | "attention";

function MiniTile({ value, label, kind = "off" }: { value: string; label: string; kind?: TileKind }) {
  return (
    <div
      className={cn(
        "flex h-[34px] min-w-0 flex-col justify-between rounded-[8px] px-1.5 pt-1.5 pb-1",
        kind === "done" ? "grad border border-transparent" : kind === "attention" ? "border border-warn-line bg-warn-soft text-ink" : "tile text-ink",
      )}
    >
      <span className="truncate text-[9px] leading-none font-medium tracking-[-0.02em]">{value}</span>
      <span className={cn("truncate text-[5.5px] leading-none", kind === "done" ? "text-accent-ink-2" : kind === "attention" ? "text-warn" : "text-ink-2")}>{label}</span>
    </div>
  );
}

function MiniStat({ value, label, fill }: { value: string; label: string; fill: number }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] leading-none font-medium tracking-[-0.03em] text-ink">{value}</p>
      <p className="mt-1 text-[4.5px] leading-none tracking-[0.18em] text-ink-2 uppercase">{label}</p>
      <div className="mt-1 h-px overflow-hidden rounded-full bg-hair">
        <div className="grad-line h-full" style={{ width: `${fill * 100}%` }} />
      </div>
    </div>
  );
}

export function MiniToday({ theme, className }: { theme: Theme; className?: string }) {
  return (
    <div
      aria-hidden
      style={{ ...(themeVars(theme) as CSSProperties), colorScheme: theme.scheme }}
      className={cn("pointer-events-none relative flex w-[184px] shrink-0 flex-col overflow-hidden rounded-[22px] border border-glass-line bg-bg text-ink shadow-float select-none", className)}
    >
      {/* The three lights, as on the page: plum top right, amber at the left edge, indigo under the bottom. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 38% at 85% 0%, var(--glow-1) 0%, transparent 70%), radial-gradient(60% 30% at 0% 22%, var(--glow-2) 0%, transparent 70%), radial-gradient(80% 40% at 50% 110%, var(--glow-3) 0%, transparent 70%)",
        }}
      />
      <div className="relative flex flex-1 flex-col px-2.5 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <p className="text-[5px] font-medium tracking-[0.18em] text-ink-2 uppercase">Lock In</p>
          <span className="grad size-2.5 rounded-full" />
        </div>
        <p className="mt-2 text-[16px] leading-[1.06] font-medium tracking-[-0.035em]">
          Good morning,
          <br />
          Sunny.
        </p>
        <p className="mt-1.5 text-[6px] text-ink-2">Thursday, October 8. Day 4 of 30.</p>

        <div className="glass mt-2.5 rounded-[11px] px-2 py-2">
          <div className="flex items-center justify-between">
            <p className="text-[4.5px] font-medium tracking-[0.18em] text-accent uppercase">Now</p>
            <p className="text-[5.5px] text-ink-2">1h left</p>
          </div>
          <p className="mt-1 text-[11px] leading-none font-medium tracking-[-0.03em]">Study block</p>
          <div className="mt-2 h-[1.5px] overflow-hidden rounded-full bg-hair">
            <div className="grad-line h-full w-[58%] rounded-full" />
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-4 gap-1.5 px-0.5">
          <MiniStat value="3/6" label="Body" fill={0.5} />
          <MiniStat value="$40" label="Money" fill={0.4} />
          <MiniStat value="0/2" label="Mind" fill={0} />
          <MiniStat value="4d" label="Clean" fill={1} />
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-1">
          <MiniTile value="5:41" label="Up by 5:45" kind="done" />
          <MiniTile value="Lift" label="Upper B" kind="done" />
          <MiniTile value="2,340" label="Calories" kind="attention" />
          <MiniTile value="112g" label="Protein" />
          <MiniTile value="$40" label="of $100" />
          <MiniTile value="Study" label="Block done" />
        </div>

        <div className="mt-2.5 flex h-[22px] items-center rounded-full border border-glass-line bg-bar px-[3px]">
          {["Today", "Schedule", "Money", "Body", "Progress"].map((t, i) => (
            <span key={t} className={cn("flex h-4 flex-1 items-center justify-center rounded-full text-[5px]", i === 0 ? "bg-ink font-medium text-bg" : "text-ink-2")}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
