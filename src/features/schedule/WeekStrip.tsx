"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { weekdayOf } from "@/lib/logic/dates";
import { WEEKDAY_SHORT, type DateStr } from "@/lib/types";

export interface WeekStripProps {
  dates: readonly DateStr[];
  selected: DateStr;
  today: DateStr;
  /** Dates that have their own edits, drawn with a dot. */
  edited: ReadonlySet<DateStr>;
  onSelect: (date: DateStr) => void;
}

/** Days to pick from, scrolled so the chosen one is in view. */
export function WeekStrip({ dates, selected, today, edited, onSelect }: WeekStripProps) {
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selected, dates.length]);

  return (
    <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 py-1" role="tablist" aria-label="Days">
      {dates.map((date) => {
        const on = date === selected;
        const isToday = date === today;
        return (
          <button
            key={date}
            ref={on ? current : undefined}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`${WEEKDAY_SHORT[weekdayOf(date)]} ${Number(date.slice(8))}${isToday ? ", today" : ""}`}
            onClick={() => {
              haptics.tap();
              onSelect(date);
            }}
            className={cn(
              "pressable flex h-[62px] w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[16px]",
              on ? "border border-ink bg-ink text-bg" : isToday ? "tile border-ink-2 text-ink" : "tile text-ink",
            )}
          >
            <span className={cn("text-[10px] font-medium tracking-[0.08em] uppercase", on ? "text-bg" : "text-ink-2")}>{WEEKDAY_SHORT[weekdayOf(date)].slice(0, 2)}</span>
            <span className={cn("text-[16px] leading-none font-medium", !on && date < today && "text-ink-2")}>{Number(date.slice(8))}</span>
            <span className={cn("mt-1 size-1.5 rounded-full", edited.has(date) ? (on ? "bg-bg" : "bg-ink-3") : "bg-transparent")} />
          </button>
        );
      })}
    </div>
  );
}
