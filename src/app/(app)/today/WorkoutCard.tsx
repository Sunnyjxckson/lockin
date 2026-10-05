"use client";

import { Card } from "@/components/ui";
import type { Workout } from "@/lib/types";
import { formatSets } from "./format";

const KIND_LABEL: Record<Workout["kind"], string> = { lift: "Lift", cardio: "Cardio", sport: "Sport", rest: "Rest" };

/** A workout shown in full: every exercise with sets and reps. */
export function WorkoutCard({ workout, tag }: { workout: Workout; tag?: string }) {
  return (
    <Card padded={false}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h3 className="t-h2 truncate">{workout.name}</h3>
          {workout.detail ? <p className="t-sub mt-0.5">{workout.detail}</p> : null}
        </div>
        <span className="mt-0.5 shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] text-ink-2 uppercase">
          {tag ?? KIND_LABEL[workout.kind]}
        </span>
      </div>
      {workout.exercises.length > 0 ? (
        <ol className="divide-y divide-line border-t border-line">
          {workout.exercises.map((e, i) => (
            <li key={`${e.name}-${i}`} className="flex min-h-[48px] items-center gap-3 px-4 py-2.5">
              <span className="tnum w-4 shrink-0 text-[13px] text-ink-3">{i + 1}</span>
              <span className="min-w-0 flex-1 text-[15px] leading-snug">{e.name}</span>
              <span className="tnum shrink-0 text-right text-[15px] font-medium text-ink-2">{formatSets(e)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="t-sub border-t border-line px-4 py-3">No exercises listed.</p>
      )}
    </Card>
  );
}
