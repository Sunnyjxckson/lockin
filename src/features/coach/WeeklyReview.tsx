"use client";

// The latest Sunday review as a card, for the Progress screen. Self-contained:
// mount <WeeklyReview /> with no props. It reads the newest coach_note of
// kind "weekly" and shows a real empty state before the first one exists.

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Card, EmptyState, cn } from "@/components/ui";
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
      <Card padded={false} className={className}>
        <EmptyState
          compact
          icon={<CalendarClock size={22} aria-hidden />}
          title={`First review lands ${formatDateLong(nextReviewDate(today))}`}
          body="What held, what slipped, and one change for the week after."
        />
      </Card>
    );
  }

  return (
    <Card className={className}>
      <p className="t-label mb-3">Week of {weekLabel(note.date)}</p>
      <NoteBody body={note.body} />
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <SourceTag source={note.source} />
        <Link href="/coach" className="text-[14px] font-semibold text-ink underline underline-offset-4">
          Coach
        </Link>
      </div>
    </Card>
  );
}

export default WeeklyReview;
