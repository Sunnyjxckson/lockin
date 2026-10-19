"use client";

// The mood check-in on Today, once or twice a day: one tap on how you are,
// then an optional note. The tap saves at once, so the note is a bonus and
// never a step. It sits under the coach's brief line and shows only when a
// check-in is due (`moodDue`): the first from 7:00 AM, the second from 5:00 PM,
// and each is answered by any entry made inside it. "Not now" closes the one
// that is open, for this device. If the mood table cannot be read, nothing shows.

import { useCallback, useState } from "react";
import { cn, TextField, useToast } from "@/components/ui";
import { useList, useMode, useNow } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { MOOD_LABEL, MOOD_LEVELS, moodDue, type MoodSlot } from "@/lib/logic/coachMood";
import { timeNY } from "@/lib/logic/dates";
import { getPref, setPref } from "@/lib/prefs";
import type { DateStr } from "@/lib/types";
import { logMood, setMoodNote } from "./memory";

const PREF = "coach_mood_skipped";

function readSkips(today: DateStr): MoodSlot[] {
  try {
    const v = JSON.parse(getPref(PREF) ?? "null") as { date?: string; slots?: unknown } | null;
    if (!v || v.date !== today || !Array.isArray(v.slots)) return [];
    return v.slots.filter((s): s is MoodSlot => s === "first" || s === "second");
  } catch {
    return [];
  }
}

export function MoodCheck({ className }: { className?: string }) {
  const toast = useToast();
  const mode = useMode();
  const today = mode.today;
  const now = useNow(60_000);
  const todays = useList("mood_log", { from: today, to: today });
  const [skipped, setSkipped] = useState<{ date: DateStr; slots: MoodSlot[] } | null>(null);
  const [logged, setLogged] = useState<{ id: string; mood: number } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const skips = skipped && skipped.date === today ? skipped.slots : readSkips(today);
  const slot = moodDue(todays.data, timeNY(now), skips);

  const pick = useCallback(
    (mood: number) => {
      if (busy) return;
      setBusy(true);
      haptics.tap();
      logMood(mood, "")
        .then((row) => {
          setLogged({ id: row.id, mood });
          setNote("");
        })
        .catch(() => toast("Could not save that", { kind: "error" }))
        .finally(() => setBusy(false));
    },
    [busy, toast],
  );

  const notNow = () => {
    if (!slot) return;
    const slots = [...skips, slot];
    setSkipped({ date: today, slots });
    setPref(PREF, JSON.stringify({ date: today, slots }));
  };

  const saveNote = () => {
    const id = logged?.id;
    const text = note.trim();
    setLogged(null);
    if (id && text) void setMoodNote(id, text).catch(() => toast("Could not save the note", { kind: "error" }));
  };

  if (mode.loading || todays.loading || todays.error) return null;

  // Just tapped: the note field, which is optional. The entry is already saved.
  if (logged) {
    return (
      <div className={cn("animate-fade-in px-1 py-2", className)}>
        <p className="t-sub">Logged: {MOOD_LABEL[logged.mood]}. Anything behind it? Optional.</p>
        <div className="mt-2 flex items-center gap-2">
          <TextField className="min-w-0 flex-1" aria-label="Note on how you feel" value={note} onChange={setNote} onCommit={() => undefined} placeholder="A few words" maxLength={200} />
          <button type="button" onClick={saveNote} className="pressable t-sub min-h-11 shrink-0 px-3 text-ink underline decoration-hair underline-offset-4">
            {note.trim() ? "Save" : "Done"}
          </button>
        </div>
      </div>
    );
  }

  if (!slot) return null;

  return (
    <div className={cn("px-1 py-2", className)} data-mood-check={slot}>
      <div className="flex items-center justify-between gap-3">
        <p className="t-label">{slot === "first" ? "How are you" : "How did today feel"}</p>
        <button type="button" onClick={notNow} className="pressable t-caption min-h-11 px-1 text-ink-2">
          Not now
        </button>
      </div>
      <div className="-mt-1 grid grid-cols-5 gap-2" role="group" aria-label="Mood, low to high">
        {MOOD_LEVELS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={busy}
            onClick={() => pick(n)}
            aria-label={`${n} of 5, ${MOOD_LABEL[n]}`}
            className="pressable tile flex h-14 flex-col items-center justify-center rounded-2xl text-ink disabled:opacity-50"
          >
            <span className="text-[17px] leading-none font-medium">{n}</span>
            <span className="t-caption mt-1 leading-none text-ink-2">{MOOD_LABEL[n]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default MoodCheck;
