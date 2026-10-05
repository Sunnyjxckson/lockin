"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import {
  Button,
  Card,
  IconButton,
  NumberField,
  PageHeader,
  Screen,
  Section,
  SegmentedControl,
  Sheet,
  TextField,
} from "@/components/ui";
import { db } from "@/lib/db";
import { workoutsFor } from "@/lib/db/helpers";
import { useToday, useWorkouts } from "@/lib/db/hooks";
import { weekdayOf } from "@/lib/logic/dates";
import { WEEKDAY_NAMES, WEEKDAY_SHORT, type Exercise, type Weekday, type Workout, type WorkoutKind, type WorkoutSlot } from "@/lib/types";
import { formatSets } from "../../today/format";

const DAYS: { value: Weekday; label: string }[] = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 0, label: "S" },
];

const KINDS: { value: WorkoutKind; label: string }[] = [
  { value: "lift", label: "Lift" },
  { value: "cardio", label: "Cardio" },
  { value: "sport", label: "Sport" },
  { value: "rest", label: "Rest" },
];

function ExerciseSheet({
  exercise,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  exercise: Exercise;
  isNew: boolean;
  onSave: (e: Exercise) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [e, setE] = useState(exercise);
  const valid = e.name.trim().length > 0 && e.sets >= 1 && e.reps.trim().length > 0;
  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? "New exercise" : "Edit exercise"}
      footer={
        <div className="flex gap-3">
          {!isNew ? (
            <Button variant="danger" onClick={onDelete}>
              Remove
            </Button>
          ) : null}
          <Button full disabled={!valid} onClick={() => onSave({ name: e.name.trim(), sets: e.sets, reps: e.reps.trim() })}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Exercise" value={e.name} onChange={(v) => setE({ ...e, name: v })} placeholder="Bench press" maxLength={60} autoFocus={isNew} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Sets" decimal={false} min={1} max={20} value={e.sets} onChange={(v) => setE({ ...e, sets: v ?? 1 })} live />
          <TextField label="Reps or time" value={e.reps} onChange={(v) => setE({ ...e, reps: v })} placeholder="8 to 10" maxLength={30} />
        </div>
      </div>
    </Sheet>
  );
}

function WorkoutEditor({ workout, weekday, slot }: { workout: Workout | null; weekday: Weekday; slot: WorkoutSlot }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [name, setName] = useState(workout?.name ?? "");
  const [detail, setDetail] = useState(workout?.detail ?? "");

  if (!workout) {
    return (
      <Card className="flex items-center justify-between gap-3">
        <p className="t-sub">{slot === "core" ? "No core routine for this day." : "Nothing planned for this day."}</p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            void db.upsert(
              "workout",
              { weekday, slot, name: slot === "core" ? "Core" : "Workout", kind: slot === "core" ? "lift" : "cardio", detail: null, exercises: [] },
              ["weekday", "slot"],
            )
          }
        >
          Add
        </Button>
      </Card>
    );
  }

  const save = (patch: Partial<Workout>) => void db.update("workout", workout.id, patch);
  const list = workout.exercises;
  const move = (i: number, by: number) => {
    const next = list.slice();
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    save({ exercises: next });
  };

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4">
        <TextField
          label="Name"
          value={name}
          onChange={setName}
          onCommit={(v) => v.trim() && v.trim() !== workout.name && save({ name: v.trim() })}
          maxLength={40}
        />
        <TextField
          label="Note"
          value={detail}
          onChange={setDetail}
          onCommit={(v) => (v.trim() || null) !== workout.detail && save({ detail: v.trim() || null })}
          placeholder="15 to 20 min"
          maxLength={60}
        />
        {slot === "main" ? (
          <div>
            <p className="t-label mb-2.5">Kind of day</p>
            <SegmentedControl label="Kind of day" size="sm" options={KINDS} value={workout.kind} onChange={(v) => save({ kind: v })} />
          </div>
        ) : null}
      </div>
      <ol className="divide-y divide-hair border-t border-hair">
        {list.map((e, i) => (
          <li key={`${e.name}-${i}`} className="flex min-h-[56px] items-center gap-1 pr-1.5 pl-4">
            <button type="button" onClick={() => setEditing(i)} className="flex min-h-[56px] min-w-0 flex-1 items-center justify-between gap-3 text-left">
              <span className="min-w-0 truncate text-[15px] text-ink">{e.name}</span>
              <span className="shrink-0 text-[15px] font-medium tracking-[-0.01em] text-ink">{formatSets(e)}</span>
            </button>
            <IconButton label={`Move ${e.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp size={18} strokeWidth={1.75} aria-hidden />
            </IconButton>
            <IconButton label={`Move ${e.name} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown size={18} strokeWidth={1.75} aria-hidden />
            </IconButton>
          </li>
        ))}
      </ol>
      <div className="border-t border-hair p-3">
        <Button variant="ghost" full icon={<Plus size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setEditing("new")}>
          Add exercise
        </Button>
      </div>

      {editing !== null ? (
        <ExerciseSheet
          exercise={editing === "new" ? { name: "", sets: 3, reps: "10" } : list[editing]}
          isNew={editing === "new"}
          onClose={() => setEditing(null)}
          onDelete={() => {
            save({ exercises: list.filter((_, i) => i !== editing) });
            setEditing(null);
          }}
          onSave={(e) => {
            save({ exercises: editing === "new" ? [...list, e] : list.map((x, i) => (i === editing ? e : x)) });
            setEditing(null);
          }}
        />
      ) : null}
    </Card>
  );
}

export default function WorkoutSettingsPage() {
  const today = useToday();
  const workouts = useWorkouts();
  const [picked, setPicked] = useState<Weekday | null>(null);
  const weekday = picked ?? weekdayOf(today);
  const { main, core } = workoutsFor(workouts.data, weekday);
  const liftDays = workouts.data
    .filter((w) => w.slot === "main" && w.kind === "lift")
    .map((w) => w.weekday)
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => WEEKDAY_SHORT[d]);

  return (
    <Screen>
      <PageHeader
        title="Workouts"
        back="/settings"
        subtitle={liftDays.length > 0 ? `Lift days: ${liftDays.join(", ")}.` : "No lift days set."}
      />
      <div className="mt-2">
        <SegmentedControl label="Weekday" size="sm" options={DAYS} value={weekday} onChange={setPicked} />
      </div>
      {workouts.loading ? null : (
        <>
          <Section title={`${WEEKDAY_NAMES[weekday]} workout`}>
            <WorkoutEditor key={main?.id ?? `main-${weekday}`} workout={main} weekday={weekday} slot="main" />
          </Section>
          <Section title="Core">
            <WorkoutEditor key={core?.id ?? `core-${weekday}`} workout={core} weekday={weekday} slot="core" />
          </Section>
        </>
      )}
    </Screen>
  );
}
