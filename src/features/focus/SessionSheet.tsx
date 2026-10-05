"use client";

// Log a session by hand, or edit or delete one that is already logged.

import { useState } from "react";
import { Button, DateField, NumberField, SegmentedControl, Sheet, TextField, TimeField, useToast } from "@/components/ui";
import { addMinutes, timeNY } from "@/lib/logic/dates";
import { LABELS, manualProblem } from "@/lib/logic/focus";
import type { DateStr, FocusSession } from "@/lib/types";
import { deleteSession, editSession, logManual } from "./store";

const QUICK = [30, 45, 60, 90, 120].map((m) => ({ value: m, label: m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}` : `${m / 60}h` }));

export interface SessionSheetProps {
  open: boolean;
  onClose: () => void;
  today: DateStr;
  /** The session to edit. Leave out to log a new one. */
  session?: FocusSession | null;
}

export function SessionSheet({ open, onClose, today, session }: SessionSheetProps) {
  const toast = useToast();
  const [date, setDate] = useState<DateStr>(session?.date ?? today);
  const [minutes, setMinutes] = useState<number | null>(session?.minutes ?? 60);
  const [label, setLabel] = useState(session?.label ?? "Study");
  const [start, setStart] = useState(() => session?.start ?? addMinutes(timeNY(), -60));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const problem = manualProblem({ date, minutes }, today);

  const save = async () => {
    if (problem || minutes === null) return;
    setBusy(true);
    try {
      if (session) await editSession(session, { date, minutes, label });
      else await logManual({ date, minutes, label, start });
      toast(session ? "Session updated" : "Focus time logged", { kind: "done" });
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save.", { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await deleteSession(session);
      toast("Session deleted");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={session ? "Edit session" : "Log focus time"}
      subtitle={session ? undefined : "For work you did without the timer."}
      footer={
        <Button full size="lg" loading={busy} disabled={!!problem} onClick={save}>
          {session ? "Save" : "Log it"}
        </Button>
      }
    >
      <div className="space-y-4">
        <NumberField label="Minutes" value={minutes} onChange={setMinutes} live unit="min" decimal={false} max={960} hint={minutes !== null && problem ? problem : undefined} />
        <SegmentedControl label="Quick lengths" size="sm" options={QUICK} value={minutes ?? 0} onChange={setMinutes} />
        <div className="flex flex-wrap gap-2">
          {LABELS.map((l) => (
            <Button key={l} size="sm" variant={label === l ? "primary" : "secondary"} onClick={() => setLabel(l)}>
              {l}
            </Button>
          ))}
        </div>
        <TextField label="Label" value={label} onChange={setLabel} maxLength={40} placeholder="Study" />
        <div className="grid grid-cols-2 gap-3">
          <DateField label="Date" value={date} onChange={(v) => setDate(v as DateStr)} max={today} />
          {session ? null : <TimeField label="Started at" value={start} onChange={setStart} />}
        </div>
        {session ? (
          confirm ? (
            <div className="flex gap-2">
              <Button full variant="danger" loading={busy} onClick={remove}>
                Delete for good
              </Button>
              <Button full variant="secondary" onClick={() => setConfirm(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button full variant="ghost" onClick={() => setConfirm(true)}>
              Delete session
            </Button>
          )
        ) : null}
      </div>
    </Sheet>
  );
}

export default SessionSheet;
