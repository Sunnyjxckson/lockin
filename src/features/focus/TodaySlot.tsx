"use client";

// The focus control for Today's "Study or homework block" row. While a timer
// runs it shows the time on the clock and opens the timer. Otherwise it is a
// small timer button that goes to the timer screen.
//
// Mount it at the right of the study row:  <FocusAction />

import Link from "next/link";
import { Timer } from "lucide-react";
import { cn } from "@/components/ui";
import { formatCountdown } from "@/lib/logic/schedule";
import { useClock, useFocusTimer } from "./useFocus";

export interface FocusActionProps {
  /** Hide the idle button, for a day that is not today. */
  runningOnly?: boolean;
  className?: string;
}

export function FocusAction({ runningOnly, className }: FocusActionProps) {
  const { live, loading } = useFocusTimer();
  const { clock } = useClock(live);
  if (loading) return null;
  if (!live || !clock) {
    if (runningOnly) return null;
    return (
      <Link
        href="/focus"
        aria-label="Open the focus timer"
        title="Focus timer"
        // Icon only, so the item's name keeps the row to itself at 390px.
        className={cn("pressable flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-line bg-surface-2 text-ink-2", className)}
      >
        <Timer size={20} aria-hidden />
      </Link>
    );
  }
  const shown = clock.remaining !== null && clock.remaining > 0 ? clock.remaining : clock.remaining === 0 ? clock.overBy : clock.focusedSeconds;
  return (
    <Link
        href="/focus"
        aria-label={`Focus timer running, ${live.label}. Open it`}
        data-focus-running
        className={cn("pressable tnum flex h-11 shrink-0 items-center gap-2 rounded-[12px] border border-line-strong bg-surface-2 px-3 text-[17px] font-semibold tracking-[-0.02em] text-ink", className)}
      >
        {clock.paused ? <Timer size={16} className="text-ink-3" aria-hidden /> : <span className="animate-pulse-dot size-1.5 rounded-full bg-ink" aria-hidden />}
        {formatCountdown(shown)}
    </Link>
  );
}

export default FocusAction;
