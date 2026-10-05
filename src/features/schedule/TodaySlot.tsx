"use client";

// A compact banner for Today: shows when a Lock In block overlaps class or an
// imported calendar event. Renders nothing when the day is clean.
//
// Mount it on Today near the Now and Next card:  <TodaySlot date={selected} />

import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { Notice, cn } from "@/components/ui";
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
      aria-label={`Schedule conflict: ${describeConflict(first)}. Open plan`}
      className={cn("pressable animate-fade-in block rounded-[20px]", className)}
    >
      <Notice tone="warn" icon={<TriangleAlert size={18} aria-hidden />} title={<span className="block truncate">{describeConflict(first)}</span>} action={<ChevronRight size={18} className="mr-2 text-ink-3" aria-hidden />}>
        <span className="block truncate">
          {formatTime(first.start)} to {formatTime(first.end)}, {formatDuration(first.minutes)}
          {more > 0 ? `, and ${more} more` : ""}
        </span>
      </Notice>
    </Link>
  );
}

export default TodaySlot;
