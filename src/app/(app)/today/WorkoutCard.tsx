"use client";

import { Card } from "@/components/ui";
import type { Workout } from "@/lib/types";
import { formatSets } from "./format";

const KIND_LABEL: Record<Workout["kind"], string> = { lift: "Lift", cardio: "Cardio", sport: "Sport", rest: "Rest" };

/** A workout shown in full: every exercise with sets and reps. */
export { KIND_LABEL };

export function WorkoutCard({ workout, tag }: { workout: Workout; tag?: string }) {
  return (
    <Card padded={false}>
      <div className="flex items-start justify-between gap-3 px-5 pt-[18px] pb-3.5">
        <div className="min-w-0">
          <h3 className="t-h2 truncate">{workout.name}</h3>
          {workout.detail ? <p className="t-sub mt-0.5">{workout.detail}</p> : null}
        </div>
        <span className="t-label mt-1.5 shrink-0">{tag ?? KIND_LABEL[workout.kind]}</span>
      </div>
      {workout.exercises.length > 0 ? (
        <ol className="divide-y divide-hair border-t border-hair">
          {workout.exercises.map((e, i) => (
            <li key={`${e.name}-${i}`} className="flex min-h-[46px] items-center gap-3 px-5 py-2.5">
              <span className="tnum w-4 shrink-0 text-[12px] text-ink-2">{i + 1}</span>
              <span className="min-w-0 flex-1 text-[15px] leading-snug">{e.name}</span>
              <span className="tnum shrink-0 text-right text-[15px] text-ink-2">{formatSets(e)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="t-sub border-t border-hair px-5 py-3">No exercises listed.</p>
      )}
    </Card>
  );
}
