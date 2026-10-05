"use client";

import { useEffect, useRef } from "react";
import { haptics } from "@/lib/haptics";
import { cn } from "@/components/ui";
import { weekdayOf } from "@/lib/logic/dates";
import type { DayStatus } from "@/lib/logic/day";
import { WEEKDAY_SHORT, type DateStr } from "@/lib/types";

export interface StripDay {
  date: DateStr;
  /** The number in the cell: the challenge day, or the day of the month. */
  label: string;
  /** What a screen reader hears: "Day 3", or "Monday, Oct 5". */
  name: string;
}

export interface DayStripProps {
  /** The days to show, in order. */
  days: StripDay[];
  today: DateStr;
  selected: DateStr;
  statusByDate: Record<DateStr, DayStatus>;
  onSelect: (date: DateStr) => void;
  label?: string;
  id?: string;
}

/** Horizontal strip of days. Tap an earlier day to open it and backfill it. */
export function DayStrip({ days, today, selected, statusByDate, onSelect, label = "Days", id }: DayStripProps) {
  const current = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    current.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selected]);

  return (
    <div id={id} className="no-scrollbar animate-fade-in -mx-5 flex gap-1.5 overflow-x-auto px-5 py-1" role="tablist" aria-label={label}>
      {days.map(({ date, label: text, name }) => {
        const future = date > today;
        const on = date === selected;
        const status = future ? null : statusByDate[date];
        return (
          <button
            key={date}
            ref={on ? current : undefined}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`${name}${date === today ? ", today" : ""}`}
            disabled={future}
            onClick={() => {
              haptics.tap();
              onSelect(date);
            }}
            className={cn(
              "pressable flex h-[62px] w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[16px]",
              on ? "border border-ink bg-ink text-bg" : "tile text-ink",
              future && "opacity-35",
            )}
          >
            {/* Full strength on the selected chip: faded, this small label fell under 7 to 1 on the high contrast base with a palette. */}
            <span className={cn("text-[10px] font-medium tracking-[0.08em] uppercase", on ? "text-bg" : "text-ink-2")}>{WEEKDAY_SHORT[weekdayOf(date)].slice(0, 2)}</span>
            <span className="tnum text-[16px] leading-none font-medium">{text}</span>
            <span
              className={cn(
                "mt-1 size-1.5 rounded-full",
                status === "full" && (on ? "bg-bg" : "grad-line"),
                status === "partial" && (on ? "bg-bg/40" : "bg-ink-3"),
                (status === "missed" || status === null || status === undefined) && "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
