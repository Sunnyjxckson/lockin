"use client";

import { useEffect, useState } from "react";
import { ProgressRing } from "@/components/ui";
import type { Milestone } from "@/lib/logic/libraryProgress";

/**
 * The moment a writer, the library or a round number is reached. The same
 * full screen moment as a finished day: the page gives way to its own color, a
 * ring closes, the thing is named. It goes away by itself or on a tap, and
 * shows without the animation under reduced motion.
 */
export function MilestoneMoment({ milestone, total, onDone }: { milestone: Milestone; total: number; onDone: () => void }) {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const start = window.requestAnimationFrame(() => setClosed(true));
    const end = window.setTimeout(onDone, 3400);
    return () => {
      window.cancelAnimationFrame(start);
      window.clearTimeout(end);
    };
  }, [onDone]);

  const copy =
    milestone.kind === "library"
      ? { label: "The whole library", title: String(milestone.total), line: `${milestone.total} of ${milestone.total} read. Every one.`, ring: 1 }
      : milestone.kind === "writer"
        ? { label: "Finished", title: milestone.name, line: `${milestone.count} of ${milestone.count} read.`, ring: 1 }
        : { label: "Quotes read", title: String(milestone.read), line: `of ${total}.`, ring: total > 0 ? milestone.read / total : 0 };
  const long = copy.title.length > 9;

  return (
    <button type="button" onClick={onDone} aria-label="Dismiss" className="animate-fade-in lit fixed inset-0 z-[60] flex flex-col items-center justify-center px-8 text-center">
      <span role="status" className="flex flex-col items-center">
        <span className="animate-day-ring">
          <ProgressRing value={closed ? copy.ring : 0} size={156} stroke={6} label={copy.label}>
            <svg width="64" height="64" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 8.4l3.2 3.1L13 4.6" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="animate-day-check" />
            </svg>
          </ProgressRing>
        </span>
        <span className="animate-day-text mt-8 block">
          <span className="t-label block text-accent">{copy.label}</span>
          <span className={`${long ? "t-num" : "t-display"} mt-4 block`}>{copy.title}</span>
          <span className="mt-4 block text-[15px] text-ink-2">{copy.line}</span>
        </span>
      </span>
    </button>
  );
}
