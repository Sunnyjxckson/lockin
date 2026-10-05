"use client";

// The focus control for Today's Study tile. It sits in the tile's top right
// corner with its own 44px tap target: a small timer icon that opens the
// timer, or, while a timer runs, the time on the clock.
//
// Mount it as the tile's corner:  <Tile corner={<FocusAction />} ... />

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
  // The tap target is 44px. What is drawn inside it is small and hugs the corner.
  const target = "pressable flex h-11 min-w-11 items-start justify-end rounded-tr-[20px] pt-3 pr-3 text-current";
  if (!live || !clock) {
    if (runningOnly) return null;
    return (
      <Link href="/focus" aria-label="Open the focus timer" title="Focus timer" className={cn(target, className)}>
        <Timer size={16} aria-hidden />
      </Link>
    );
  }
  const shown = clock.remaining !== null && clock.remaining > 0 ? clock.remaining : clock.remaining === 0 ? clock.overBy : clock.focusedSeconds;
  return (
    <Link href="/focus" aria-label={`Focus timer running, ${live.label}. Open it`} data-focus-running className={cn(target, "tabular items-center gap-1 text-[12px]", className)}>
      {clock.paused ? <Timer size={12} aria-hidden /> : <span className="animate-pulse-dot size-1.5 rounded-full bg-current" aria-hidden />}
      {formatCountdown(shown)}
    </Link>
  );
}

export default FocusAction;
