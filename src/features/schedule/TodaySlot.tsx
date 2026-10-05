"use client";

// A compact banner for Today: shows when a Lock In block overlaps class or an
// imported calendar event. Renders nothing when the day is clean.
//
// Mount it on Today near the Now and Next card:  <TodaySlot date={selected} />

import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { useDayBlocks, useToday } from "@/lib/db/hooks";
import { describeConflict, findCalendarConflicts } from "@/lib/logic/calendar";
import { formatDuration, formatTime } from "@/lib/logic/dates";
import type { DateStr } from "@/lib/types";

export interface TodaySlotProps {
  /** Defaults to today in New York. */
  date?: DateStr;
  className?: string;
}

export function TodaySlot({ date, className }: TodaySlotProps) {
  const today = useToday();
  const day = date ?? today;
  const { data: blocks, loading } = useDayBlocks(day);
  if (loading) return null;
  const conflicts = findCalendarConflicts(blocks);
  if (conflicts.length === 0) return null;
  const first = conflicts[0];
  const more = conflicts.length - 1;

  return (
    <Link
      href={`/schedule?date=${day}`}
      aria-label={`Schedule conflict: ${describeConflict(first)}. Open schedule`}
      className={`pressable animate-fade-in flex items-center gap-3 rounded-[16px] border border-warn/40 bg-warn-soft px-3.5 py-3 ${className ?? ""}`}
    >
      <TriangleAlert size={20} className="shrink-0 text-warn" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{describeConflict(first)}</p>
        <p className="tnum truncate text-[13px] text-ink-2">
          {formatTime(first.start)} to {formatTime(first.end)}, {formatDuration(first.minutes)}
          {more > 0 ? `, and ${more} more` : ""}
        </p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
    </Link>
  );
}

export default TodaySlot;
