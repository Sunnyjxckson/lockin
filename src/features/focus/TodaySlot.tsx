"use client";

// The focus control for Today's "Study or homework block" row. While a timer
// runs it shows the time on the clock and opens the timer. Otherwise it is a
// small "Focus" button that goes to the timer screen. It also keeps watch for
// the app being left while a session runs.
//
// Mount it at the right of the study row:  <FocusAction />

import Link from "next/link";
import { Timer } from "lucide-react";
import { cn } from "@/components/ui";
import { formatCountdown } from "@/lib/logic/schedule";
import { FocusWatcher } from "./FocusWatcher";
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
        className={cn("pressable flex h-11 shrink-0 items-center gap-1.5 rounded-[12px] border border-line bg-surface-2 px-3 text-[14px] font-semibold text-ink", className)}
      >
        <Timer size={16} className="text-ink-3" aria-hidden />
        Focus
      </Link>
    );
  }
  const shown = clock.remaining !== null && clock.remaining > 0 ? clock.remaining : clock.remaining === 0 ? clock.overBy : clock.focusedSeconds;
  return (
    <>
      <FocusWatcher />
      <Link
        href="/focus"
        aria-label={`Focus timer running, ${live.label}. Open it`}
        data-focus-running
        className={cn("pressable tnum flex h-11 shrink-0 items-center gap-2 rounded-[12px] border border-line-strong bg-surface-2 px-3 text-[17px] font-semibold tracking-[-0.02em] text-ink", className)}
      >
        {clock.paused ? <Timer size={16} className="text-ink-3" aria-hidden /> : <span className="animate-pulse-dot size-1.5 rounded-full bg-ink" aria-hidden />}
        {formatCountdown(shown)}
      </Link>
    </>
  );
}

export default FocusAction;
