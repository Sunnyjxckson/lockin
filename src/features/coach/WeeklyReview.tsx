"use client";

// The latest Sunday review as a card, for the Progress screen. Self-contained:
// mount <WeeklyReview /> with no props. It reads the newest coach_note of
// kind "weekly" and shows a real empty state before the first one exists.

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Card, EmptyState, GlassCard, cn } from "@/components/ui";
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
      <EmptyState
        row
        className={className}
        icon={<CalendarClock size={20} strokeWidth={1.75} aria-hidden />}
        title={`First review lands ${formatDateLong(nextReviewDate(today))}`}
        body="What held, what slipped, one change."
      />
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
