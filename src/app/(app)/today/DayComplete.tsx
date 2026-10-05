"use client";

import { useEffect, useState } from "react";
import { ProgressRing } from "@/components/ui";

export interface DayCompleteProps {
  day: number;
  total: number;
  /** Full days in a row, this one included. */
  streak: number;
  isToday: boolean;
  onDone: () => void;
}

/**
 * The moment the last item of a day lands: the screen dims, a ring closes
 * and the day is named. It goes away on its own or on a tap. With reduced
 * motion it shows without the animation.
 */
export function DayComplete({ day, total, streak, isToday, onDone }: DayCompleteProps) {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    // Mount with the ring open, then close it so the stroke animates.
    const start = window.requestAnimationFrame(() => setClosed(true));
    const end = window.setTimeout(onDone, 2800);
    return () => {
      window.cancelAnimationFrame(start);
      window.clearTimeout(end);
    };
  }, [onDone]);

  return (
    <button
      type="button"
      onClick={onDone}
      aria-label="Dismiss"
      className="animate-fade-in fixed inset-0 z-[60] flex flex-col items-center justify-center bg-bg/92 px-8 text-center backdrop-blur-sm"
    >
      <span role="status" className="flex flex-col items-center">
        <span className="animate-day-ring">
          <ProgressRing value={closed ? 1 : 0} size={156} stroke={10} label="Day complete">
            <svg width="64" height="64" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 8.4l3.2 3.1L13 4.6" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="animate-day-check" />
            </svg>
          </ProgressRing>
        </span>
        <span className="animate-day-text mt-8 block">
          <span className="t-label block text-accent">{isToday ? "Locked in" : "Day complete"}</span>
          <span className="t-display mt-3 block">Day {day}</span>
          <span className="tnum mt-4 block text-[16px] text-ink-2">
            {total} of {total} done.{streak > 1 ? ` ${streak} full days in a row.` : ""}
          </span>
        </span>
      </span>
    </button>
  );
}
