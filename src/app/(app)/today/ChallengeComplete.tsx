"use client";

import { useEffect, useState } from "react";
import { ProgressRing } from "@/components/ui";
import { formatDateShort } from "@/lib/logic/dates";
import { plannedEnd } from "@/lib/logic/challenge";
import type { Challenge } from "@/lib/types";

export interface ChallengeCompleteProps {
  challenge: Challenge;
  /** Full days in the challenge. */
  full: number;
  onDone: () => void;
}

/**
 * The finish moment for a whole challenge. Bigger and slower than a full day:
 * the ring closes on the share of days that were full, then the name and the
 * count land. It stays until it is tapped, so it is not missed.
 */
export function ChallengeComplete({ challenge, full, onDone }: ChallengeCompleteProps) {
  const [closed, setClosed] = useState(false);
  const length = Math.max(1, challenge.length_days);

  useEffect(() => {
    const start = window.requestAnimationFrame(() => setClosed(true));
    return () => window.cancelAnimationFrame(start);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Challenge complete"
      className="animate-fade-in fixed inset-0 z-[60] flex flex-col items-center justify-center bg-bg/95 px-8 text-center backdrop-blur-sm"
    >
      <span className="animate-day-ring">
        <ProgressRing value={closed ? Math.min(1, full / length) : 0} size={176} stroke={12} label="Full days in the challenge">
          <span className="t-num tnum">
            {full}
            <span className="text-[18px] font-medium text-ink-3">/{length}</span>
          </span>
        </ProgressRing>
      </span>
      <div className="animate-day-text mt-8">
        <p className="t-label text-accent">Challenge complete</p>
        <h2 className="t-title mt-3">{challenge.name}</h2>
        <p className="tnum mt-3 text-[16px] text-ink-2">
          {formatDateShort(challenge.start_date)} to {formatDateShort(plannedEnd(challenge))}. {full} of {length} days locked in.
        </p>
        <p className="mt-2 text-[15px] text-ink-3">Everything you logged stays. Tomorrow is just the next day.</p>
      </div>
      <button type="button" onClick={onDone} className="pressable animate-day-text mt-9 h-12 rounded-[14px] bg-ink px-7 text-[16px] font-semibold text-bg">
        Keep going
      </button>
    </div>
  );
}
