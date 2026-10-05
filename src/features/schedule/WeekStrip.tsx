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
              "pressable flex h-[62px] w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[14px] border",
              on ? "border-ink bg-ink text-bg" : isToday ? "border-line-strong bg-surface-2 text-ink" : "border-line bg-surface text-ink",
              date < today && !on && "opacity-50",
            )}
          >
            <span className={cn("text-[10px] font-semibold tracking-[0.06em] uppercase", on ? "text-bg/60" : "text-ink-3")}>
              {WEEKDAY_SHORT[weekdayOf(date)].slice(0, 2)}
            </span>
            <span className="tnum text-[17px] leading-none font-semibold">{Number(date.slice(8))}</span>
            <span className={cn("mt-1 size-1 rounded-full", edited.has(date) ? (on ? "bg-bg/50" : "bg-ink-3") : "bg-transparent")} />
          </button>
        );
      })}
    </div>
  );
}
