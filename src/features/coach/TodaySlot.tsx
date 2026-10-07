"use client";

// The morning brief on Today, as one quiet line under the date: a label and
// the first sentence of the brief (what today holds). Self-contained: mount
// <TodaySlot /> with no props. It shows in both modes, challenge or ongoing.
// The first open of the day writes the brief.
//
// It is one line so the first screen stays greeting, Now, the four tracks and
// the tiles. A tap opens the opening paragraph in place, with a link to the
// coach's notes for the rest. It folds away again on the next visit.

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { plural } from "@/lib/logic/coach";
import { NoteBody } from "./parts";
import { useCoach } from "./useCoach";

export function TodaySlot({ className }: { className?: string }) {
  const coach = useCoach("missing");
  const [open, setOpen] = useState(false);

  // Hold the line's height while the notes load, so nothing below jumps.
  if (coach.loading) return <div className={cn("h-11", className)} aria-busy="true" />;
  if (coach.phase !== "active") return null;
  if (!coach.brief && !coach.writingBrief) return null;

  const parts = coach.brief?.body.split(/\n+/).filter((p) => p.trim()) ?? [];
  const first = parts[0] ?? "";
  // "Today: Upper A at 6:30 AM, class..." reads as "Upper A at 6:30 AM, class..." after the label.
  const line = first.replace(/^Today[.:]\s*/i, "").replace(/^./, (c) => c.toUpperCase());
  const flags = coach.flags.length;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          haptics.tap();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-controls="coach-brief"
        aria-label={`Morning brief${flags > 0 ? `, ${plural(flags, "flag")}` : ""}${line ? `: ${line}` : ""}`}
        className="pressable flex min-h-11 w-full items-center gap-2.5 px-1 text-left"
      >
        <span className="t-label flex shrink-0 items-center gap-1.5">
          {flags > 0 ? <span className="size-1.5 rounded-full bg-warn" aria-hidden /> : null}
          Brief
        </span>
        <span className="t-sub min-w-0 flex-1 truncate" data-brief-line>
          {open ? "" : line || "Writing today's brief."}
        </span>
        <ChevronDown size={15} className={cn("shrink-0 text-ink-2 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id="coach-brief" className="animate-fade-in px-1 pb-1">
          {coach.brief ? (
            <>
              {/* Open, it shows the first paragraph: what today holds. The rest is one tap away, so Today stays short. */}
              <NoteBody body={first} className="[&_p]:text-[14px] [&_p]:leading-[1.5] [&_p]:text-ink-2 [&_span]:font-medium" />
              <Link href="/coach/notes" className="mt-0.5 inline-flex min-h-11 items-center text-[13px] text-ink underline decoration-hair underline-offset-4">
                {flags > 0 ? `Read the rest, ${plural(flags, "flag")}` : parts.length > 1 ? "Read the rest" : "Open notes"}
              </Link>
            </>
          ) : (
            <p className="t-sub pb-3" aria-busy="true">
              Writing today&apos;s brief.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default TodaySlot;
