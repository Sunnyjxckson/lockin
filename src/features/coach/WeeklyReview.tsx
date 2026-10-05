"use client";

// The latest Sunday review as a card, for the Progress screen. Self-contained:
// mount <WeeklyReview /> with no props. It reads the newest coach_note of
// kind "weekly" and shows a real empty state before the first one exists.

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Card, GlassCard, cn } from "@/components/ui";
import { useList, useToday } from "@/lib/db/hooks";
import { nextReviewDate } from "@/lib/logic/coach";
import { formatDateLong } from "@/lib/logic/dates";
import { NoteBody, SourceTag, weekLabel } from "./parts";

export function WeeklyReview({ className }: { className?: string }) {
  const today = useToday();
  const notes = useList("coach_note", { eq: { kind: "weekly" }, orderBy: "date", ascending: false, limit: 1 });
  if (notes.loading) return <Card className={cn("h-[180px]", className)} aria-busy="true" />;
  const note = notes.data[0];

  if (!note) {
    return (
      <div className={cn("tile flex items-center gap-3.5 rounded-[20px] px-4 py-3.5", className)}>
        <CalendarClock size={20} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-[15px] text-ink">First review lands {formatDateLong(nextReviewDate(today))}</h3>
          <p className="t-caption mt-0.5 text-ink-2">What held, what slipped, one change.</p>
        </div>
      </div>
    );
  }

  return (
    <GlassCard className={className}>
      <p className="t-label mb-3">Week of {weekLabel(note.date)}</p>
      <NoteBody body={note.body} />
      <div className="mt-4 flex items-center justify-between gap-3">
        <SourceTag source={note.source} />
        <Link href="/coach" className="-my-3 inline-flex min-h-11 items-center text-[13px] text-ink underline decoration-hair underline-offset-4">
          Coach
        </Link>
      </div>
    </GlassCard>
  );
}

export default WeeklyReview;
