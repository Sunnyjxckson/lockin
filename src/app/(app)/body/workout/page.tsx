"use client";

import { useMemo, useState } from "react";
import { Dumbbell } from "lucide-react";
import { CheckMark, EmptyState, PageHeader, ProgressBar, Screen, cn, useToast } from "@/components/ui";
import { useList, useSettings, useToday, useWorkouts } from "@/lib/db/hooks";
import { workoutsFor } from "@/lib/db/helpers";
import { haptics } from "@/lib/haptics";
import { addDays, formatDateLong, formatDateShort, weekdayOf } from "@/lib/logic/dates";
import { formatSet, isLoggable, lastSession, prefillSet, setsOn, workoutProgress, type SetValues } from "@/lib/logic/workout";
import { WEEKDAY_NAMES, type DateStr, type Exercise, type SetLog, type Workout } from "@/lib/types";
import { clearSet, logSet } from "@/features/body/data";

function SetInput({
  value,
  onChange,
  label,
  unit,
  decimal,
  done,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  unit: string;
  decimal: boolean;
  done: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value === null ? "" : String(value));
  const parse = (t: string): number | null => {
    const n = Number(t.replace(/,/g, ""));
    return t.trim() === "" || !Number.isFinite(n) ? null : decimal ? Math.round(n * 100) / 100 : Math.round(n);
  };
  return (
    <label
      className={cn(
        "tile flex h-12 min-w-0 flex-1 items-baseline gap-1 rounded-[16px] px-3 pt-[13px] transition-colors focus-within:border-ink-2",
        done && "border-accent-line",
      )}
    >
      <input
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        enterKeyHint="done"
        autoComplete="off"
        aria-label={label}
        placeholder="0"
        value={shown}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const next = e.target.value.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, "").slice(0, 6);
          setText(next);
          onChange(parse(next));
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={cn(
          "w-full min-w-0 bg-transparent text-[18px] leading-none font-medium tracking-[-0.02em] outline-none placeholder:text-ink-3",
          done ? "text-accent" : "text-ink",
        )}
      />
      <span className="t-caption shrink-0 text-ink-2">{unit}</span>
    </label>
  );
}

function ExerciseCard({ exercise, date, all, unit }: { exercise: Exercise; date: string; all: SetLog[]; unit: string }) {
  const toast = useToast();
  const last = useMemo(() => lastSession(all, exercise.name, date), [all, exercise.name, date]);
  const today = useMemo(() => setsOn(all, exercise.name, date), [all, exercise.name, date]);
  const [drafts, setDrafts] = useState<Record<number, SetValues>>({});
  const logged = today.filter((l) => l.set_number <= exercise.sets).length;
  const complete = logged >= exercise.sets;

  const fail = (e: unknown) => {
    haptics.error();
    toast(e instanceof Error ? e.message : "Could not save the set", { kind: "error" });
  };

  return (
    <section className="mt-8" aria-label={exercise.name}>
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="t-h2 truncate">{exercise.name}</h2>
          <p className="t-sub mt-1">
            {exercise.sets} x {exercise.reps}
            {last.length > 0 ? `, last ${formatDateShort(last[0].date)}` : ", first time"}
          </p>
        </div>
        <span className={cn("t-label shrink-0 pb-0.5", complete ? "text-accent" : null)}>
          {logged} of {exercise.sets}
        </span>
      </div>
      <ol className="mt-3 flex flex-col gap-2">
        {Array.from({ length: exercise.sets }, (_, i) => i + 1).map((n) => {
          const row = today.find((l) => l.set_number === n) ?? null;
          const lastRow = last.find((l) => l.set_number === n) ?? null;
          const current: SetValues = row ? { weight: row.weight, reps: row.reps } : (drafts[n] ?? prefillSet(exercise, n, last, today));
          const change = (patch: Partial<SetValues>) => {
            const next = { ...current, ...patch };
            if (row) logSet(date, exercise.name, n, next.weight, next.reps).catch(fail);
            else setDrafts((d) => ({ ...d, [n]: next }));
          };
          const toggle = () => {
            if (row) {
              setDrafts((d) => ({ ...d, [n]: { weight: row.weight, reps: row.reps } }));
              clearSet(date, exercise.name, n).catch(fail);
              haptics.tap();
              return;
            }
            if (current.reps === null && current.weight === null) {
              haptics.error();
              toast("Enter the weight or reps first");
              return;
            }
            haptics.done();
            logSet(date, exercise.name, n, current.weight, current.reps).catch(fail);
          };
          return (
            <li key={`${n}-${row ? "logged" : "open"}`} className="flex items-center gap-2 pl-1">
              <span className="w-4 shrink-0 text-[14px] text-ink-2" aria-hidden>
                {n}
              </span>
              <SetInput label={`${exercise.name} set ${n} weight`} unit={unit} decimal value={current.weight} done={!!row} onChange={(weight) => change({ weight })} />
              <SetInput label={`${exercise.name} set ${n} reps`} unit="reps" decimal={false} value={current.reps} done={!!row} onChange={(reps) => change({ reps })} />
              <span className="t-caption w-[58px] shrink-0 text-right text-ink-2">{formatSet(lastRow) || "new"}</span>
              <button
                type="button"
                role="checkbox"
                aria-checked={!!row}
                aria-label={`${exercise.name} set ${n} done`}
                onClick={toggle}
                className="pressable -mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-full"
              >
                <CheckMark checked={!!row} size={30} />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default function WorkoutLogPage() {
  const today = useToday();
  const { data: workouts, loading } = useWorkouts();
  const { data: all } = useList("set_log", { orderBy: "date" });
  const { data: settings } = useSettings();
  const unit = settings?.weight_unit ?? "lb";
  const { main } = workoutsFor(workouts, weekdayOf(today));
  const progress = workoutProgress(main, all, today);

  let nextLift: { date: DateStr; workout: Workout } | null = null;
  for (let i = 1; i <= 7 && !nextLift; i++) {
    const d = addDays(today, i);
    const w = workoutsFor(workouts, weekdayOf(d)).main;
    if (isLoggable(w) && w) nextLift = { date: d, workout: w };
  }

  return (
    <Screen>
      <PageHeader title="Log workout" eyebrow={formatDateLong(today)} back="/body" subtitle={main && isLoggable(main) ? `${main.name}${main.detail ? `, ${main.detail.toLowerCase()}` : ""}` : undefined} />
      {main && isLoggable(main) ? (
        <>
          <section className="pt-2" aria-label="Sets logged">
            <p className="flex items-baseline gap-2.5">
              <span className={cn("t-display", progress.complete ? "text-accent" : "text-ink")}>{progress.logged}</span>
              <span className="text-[16px] text-ink-2">of {progress.total} sets</span>
            </p>
            <ProgressBar className="mt-4" value={progress.total > 0 ? progress.logged / progress.total : 0} label="Sets logged" />
            <p className="t-sub mt-3">{progress.complete ? "All logged. Tick Workout on Today yourself." : "Last time's numbers are filled in. Tap the circle to log a set."}</p>
          </section>
          {main.exercises.map((e, i) => (
            <ExerciseCard key={`${e.name}-${i}`} exercise={e} date={today} all={all} unit={unit} />
          ))}
        </>
      ) : loading ? null : (
        <EmptyState
          icon={<Dumbbell size={22} strokeWidth={1.75} aria-hidden />}
          title="No lift today"
          body={[
            main ? `Today is ${main.name.toLowerCase()}, nothing to log set by set.` : "Nothing is planned for today.",
            nextLift ? `Next lift: ${nextLift.workout.name} on ${WEEKDAY_NAMES[weekdayOf(nextLift.date)]}.` : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      )}
    </Screen>
  );
}
