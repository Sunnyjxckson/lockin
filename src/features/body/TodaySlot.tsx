"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Dumbbell } from "lucide-react";
import { Card, ListRow, Section, cn } from "@/components/ui";
import { useList, useToday, useWorkouts } from "@/lib/db/hooks";
import { workoutsFor } from "@/lib/db/helpers";
import { weekdayOf } from "@/lib/logic/dates";
import { isLoggable, workoutProgress } from "@/lib/logic/workout";

/**
 * The way into set logging from Today's workout section: "Log sets, 3 of 14".
 * Sits in the section header. Renders nothing on days with no lift.
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
    <Link href="/body/workout" className={cn("pressable -my-3 flex min-h-11 items-center gap-0.5 text-[13px] font-semibold tracking-normal normal-case", p.complete ? "text-accent" : "text-ink", className)}>
      <span className="tnum">{p.logged > 0 ? `Log sets, ${p.logged} of ${p.total}` : "Log sets"}</span>
      <ChevronRight size={16} aria-hidden />
    </Link>
  );
}

/** The same entry point as a full row, for the Body screen. Always shown, so set logging has one fixed home. */
export function WorkoutRow() {
  const today = useToday();
  const { data: workouts } = useWorkouts();
  const { data: sets } = useList("set_log", { eq: { date: today } });
  const { main } = workoutsFor(workouts, weekdayOf(today));
  const loggable = isLoggable(main) && !!main;
  const p = loggable && main ? workoutProgress(main, sets, today) : null;
  return (
    <Section title="Workout">
      <Card padded={false} className="overflow-hidden">
        <ListRow
          href="/body/workout"
          left={<Dumbbell size={20} aria-hidden />}
          title="Log workout"
          sub={main ? (loggable ? main.name : `${main.name} today, nothing to log`) : "No workout set for today"}
          right={p ? <span className={cn("tnum", p.complete && "text-accent")}>{p.logged} of {p.total} sets</span> : undefined}
        />
      </Card>
    </Section>
  );
}

export { TodaySlot };
