"use client";

// The slot for the coach's written Sunday review. It shows the latest
// coach_note of kind "weekly". The Coach feature can swap its own component
// in here, the section title stays "Weekly review".

import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { Card, EmptyState, Section } from "@/components/ui";
import { useList } from "@/lib/db/hooks";
import { formatDateLong } from "@/lib/logic/dates";
import { stripDashes } from "@/lib/logic/progress";

export function WeeklyReview() {
  const notes = useList("coach_note", { eq: { kind: "weekly" }, orderBy: "date", ascending: false, limit: 1 });
  const note = notes.data[0] ?? null;
  return (
    <Section
      title="Weekly review"
      right={
        <Link href="/coach" className="pressable text-ink-2">
          Coach
        </Link>
      }
    >
      {note ? (
        <Card>
          <div className="flex items-center justify-between">
            <span className="t-sub">{formatDateLong(note.date)}</span>
            {note.source === "fallback" ? <span className="text-[12px] text-ink-3">From your numbers</span> : null}
          </div>
          <div className="mt-2.5 space-y-2.5 text-[16px] leading-relaxed text-ink">
            {stripDashes(note.body)
              .split(/\n{2,}/)
              .map((para, i) => (
                <p key={i} className="whitespace-pre-line">
                  {para.trim()}
                </p>
              ))}
          </div>
        </Card>
      ) : notes.loading ? null : (
        <Card>
          <EmptyState
            compact
            icon={<NotebookPen size={22} aria-hidden />}
            title="No review yet"
            body="The coach writes one each Sunday: what held, what slipped, and one change for next week."
          />
        </Card>
      )}
    </Section>
  );
}
