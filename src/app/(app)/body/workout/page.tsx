"use client";

import { useMemo, useState } from "react";
import { Dumbbell } from "lucide-react";
import { Card, CheckMark, EmptyState, PageHeader, ProgressBar, Screen, cn, useToast } from "@/components/ui";
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
        "flex h-11 min-w-0 flex-1 items-center gap-1 rounded-[12px] border bg-surface-2 px-2.5 transition-colors focus-within:border-ink-3",
        done ? "border-accent-line" : "border-line",
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
          "tnum w-full min-w-0 bg-transparent text-right text-[18px] font-semibold tracking-[-0.02em] outline-none placeholder:text-ink-3",
          done ? "text-accent" : "text-ink",
        )}
      />
      <span className="shrink-0 text-[12px] font-medium text-ink-3">{unit}</span>
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
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="t-h2 truncate">{exercise.name}</h2>
          <p className="t-sub mt-0.5">
            {exercise.sets} x {exercise.reps}
            {last.length > 0 ? `, last on ${formatDateShort(last[0].date)}` : ", first time"}
          </p>
        </div>
        <span className={cn("tnum mt-1 shrink-0 text-[14px] font-semibold", complete ? "text-accent" : "text-ink-3")}>
          {logged} of {exercise.sets}
        </span>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-4 pt-2.5 pb-1 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
        <span className="w-5">Set</span>
        <span className="flex-1">Weight</span>
        <span className="flex-1">Reps</span>
        <span className="w-[68px] text-right">Last</span>
        <span className="w-11" />
      </div>
      <ol className="pb-2">
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
            <li key={`${n}-${row ? "logged" : "open"}`} className="flex min-h-[52px] items-center gap-2 px-4">
              <span className="tnum w-5 shrink-0 text-[15px] font-semibold text-ink-3">{n}</span>
              <SetInput label={`${exercise.name} set ${n} weight`} unit={unit} decimal value={current.weight} done={!!row} onChange={(weight) => change({ weight })} />
              <SetInput label={`${exercise.name} set ${n} reps`} unit="reps" decimal={false} value={current.reps} done={!!row} onChange={(reps) => change({ reps })} />
              <span className="tnum w-[68px] shrink-0 text-right text-[14px] text-ink-3">{formatSet(lastRow) || "new"}</span>
              <button
                type="button"
                role="checkbox"
                aria-checked={!!row}
                aria-label={`${exercise.name} set ${n} done`}
                onClick={toggle}
                className="pressable flex size-11 shrink-0 items-center justify-center"
              >
                <CheckMark checked={!!row} size={30} />
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
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
          <Card className="mt-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="flex items-baseline gap-2">
                <span className={cn("t-num tnum", progress.complete && "text-accent")}>{progress.logged}</span>
                <span className="text-[15px] font-medium text-ink-3">of {progress.total} sets</span>
              </p>
              {progress.complete ? <span className="text-[14px] font-semibold text-accent">All logged</span> : null}
            </div>
            <ProgressBar className="mt-3" value={progress.total > 0 ? progress.logged / progress.total : 0} label="Sets logged" />
            <p className="t-sub mt-3">
              {progress.complete
                ? "Every set is in. Tick Workout on Today yourself when you are done."
                : "Each set starts with last time's numbers. Tap the circle to log it, or change the numbers first."}
            </p>
          </Card>
          <div className="mt-4 flex flex-col gap-3">
            {main.exercises.map((e, i) => (
              <ExerciseCard key={`${e.name}-${i}`} exercise={e} date={today} all={all} unit={unit} />
            ))}
          </div>
        </>
      ) : loading ? null : (
        <EmptyState
          icon={<Dumbbell size={24} aria-hidden />}
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
