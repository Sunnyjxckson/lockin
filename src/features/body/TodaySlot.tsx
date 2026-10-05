"use client";

import Link from "next/link";
import { ChevronRight, Dumbbell } from "lucide-react";
import { ProgressBar, cn } from "@/components/ui";
import { useList, useToday, useWorkouts } from "@/lib/db/hooks";
import { workoutsFor } from "@/lib/db/helpers";
import { weekdayOf } from "@/lib/logic/dates";
import { isLoggable, workoutProgress } from "@/lib/logic/workout";

/**
 * Compact "Log workout" entry point: sets logged out of the plan for today's
 * lift, linking to /body/workout. Renders nothing on days with no lift.
 * It never ticks the Workout checklist item.
 */
export default function TodaySlot({ className }: { className?: string }) {
  const today = useToday();
  const { data: workouts } = useWorkouts();
  const { data: sets } = useList("set_log", { eq: { date: today } });
  const { main } = workoutsFor(workouts, weekdayOf(today));
  if (!isLoggable(main) || !main) return null;
  const p = workoutProgress(main, sets, today);
  return (
    <Link
      href="/body/workout"
      className={cn("pressable flex min-h-[68px] items-center gap-3.5 rounded-[20px] border border-line bg-surface px-4 py-3 active:bg-surface-2", className)}
    >
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", p.complete ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2")}>
        <Dumbbell size={20} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[16px] font-semibold">Log workout</span>
          <span className={cn("tnum shrink-0 text-[15px] font-semibold", p.complete ? "text-accent" : "text-ink-2")}>
            {p.logged} of {p.total} sets
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-ink-3">{main.name}</span>
        <ProgressBar className="mt-2" height={4} value={p.total > 0 ? p.logged / p.total : 0} label="Sets logged" />
      </span>
      <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
    </Link>
  );
}

export { TodaySlot };
