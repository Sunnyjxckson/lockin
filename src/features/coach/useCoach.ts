"use client";

// The coach's notes, live, plus the actions on them. Mounting it runs the
// coach routine (flags, today's brief, the review when due).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import { useList, useMode, useNow } from "@/lib/db/hooks";
import { activeFlagNotes, parseFlagNote, reviewDue, type FlagNote, type ReviewDue } from "@/lib/logic/coach";
import { timeNY } from "@/lib/logic/dates";
import type { Challenge, CoachNote, DateStr } from "@/lib/types";
import { dismissFlag, restoreFlag, syncCoach } from "./data";

export interface ActiveFlag {
  id: string;
  date: DateStr;
  note: FlagNote;
}

export interface CoachState {
  loading: boolean;
  today: DateStr;
  /** "challenge" while one is running today, otherwise "ongoing". */
  mode: "challenge" | "ongoing";
  /** The challenge running today. Null in ongoing mode. */
  challenge: Challenge | null;
  /** before: the history starts after today. active: every other day. */
  phase: "before" | "active";
  /** Day of the running challenge. Null in ongoing mode. */
  dayNumber: number | null;
  /** Today's morning brief, once written. */
  brief: CoachNote | null;
  /** True while the first brief of the day is being written. */
  writingBrief: boolean;
  flags: ActiveFlag[];
  /** The latest weekly review. */
  weekly: CoachNote | null;
  /** The review that is current, whether or not it is written yet. */
  due: ReviewDue | null;
  /** True when `due` has no note yet. */
  reviewMissing: boolean;
  /** Everything else, newest first. */
  history: CoachNote[];
  busy: "morning" | "weekly" | null;
  regenerate: () => void;
  writeReview: () => void;
  dismiss: (id: string) => void;
  restore: (id: string) => void;
}

/**
 * `auto` decides when the routine runs on mount: "always" for the Coach
 * screen, "missing" for the Today card, which only needs it when today has
 * no brief yet.
 */
export function useCoach(auto: "always" | "missing" = "always"): CoachState {
  const toast = useToast();
  const mode = useMode();
  const today = mode.today;
  const now = useNow(60_000);
  const notes = useList("coach_note", { orderBy: "date", ascending: false });
  const [busy, setBusy] = useState<"morning" | "weekly" | null>(null);
  const [failed, setFailed] = useState(false);

  const c = mode.challenge;
  const loading = mode.loading || notes.loading;
  const phase = today < mode.historyStart ? "before" : "active";

  const brief = useMemo(() => notes.data.find((n) => n.kind === "morning" && n.date === today) ?? null, [notes.data, today]);
  const flags = useMemo(() => activeFlagNotes(notes.data), [notes.data]);
  const weekly = useMemo(() => notes.data.find((n) => n.kind === "weekly") ?? null, [notes.data]);
  const time = timeNY(now);
  const due = useMemo(() => (phase !== "before" ? reviewDue(today, time, mode.historyStart) : null), [phase, today, time, mode.historyStart]);
  const reviewMissing = !!due && !notes.data.some((n) => n.kind === "weekly" && n.date === due.weekEnd);

  const history = useMemo(() => {
    const live = new Set(flags.map((f) => f.id));
    return notes.data
      .filter((n) => n.id !== brief?.id && n.id !== weekly?.id && !live.has(n.id))
      .filter((n) => n.kind !== "flag" || parseFlagNote(n.body) !== null)
      .sort((a, b) => (a.date === b.date ? (a.created_at < b.created_at ? 1 : -1) : a.date < b.date ? 1 : -1));
  }, [notes.data, brief, weekly, flags]);

  // Run the routine once per day per mount.
  const ran = useRef<string | null>(null);
  const hasBrief = !!brief;
  useEffect(() => {
    if (loading || phase === "before") return;
    if (ran.current === today) return;
    if (auto === "missing" && (hasBrief || phase !== "active")) return;
    ran.current = today;
    syncCoach(today).catch(() => setFailed(true));
  }, [loading, phase, today, auto, hasBrief]);

  const regenerate = useCallback(() => {
    setBusy("morning");
    syncCoach(today, { regenerate: true })
      .then(() => toast("Brief rewritten", { kind: "done" }))
      .catch(() => toast("Could not rewrite the brief", { kind: "error" }))
      .finally(() => setBusy(null));
  }, [today, toast]);

  const writeReview = useCallback(() => {
    setBusy("weekly");
    syncCoach(today, { weekly: true })
      .then(() => toast("Review written", { kind: "done" }))
      .catch(() => toast("Could not write the review", { kind: "error" }))
      .finally(() => setBusy(null));
  }, [today, toast]);

  const dismiss = useCallback(
    (id: string) => {
      dismissFlag(id, today).then(
        () => toast("Flag dismissed. It is in History."),
        () => toast("Could not dismiss the flag", { kind: "error" }),
      );
    },
    [today, toast],
  );

  const restore = useCallback(
    (id: string) => {
      restoreFlag(id).catch(() => toast("Could not restore the flag", { kind: "error" }));
    },
    [toast],
  );

  return {
    loading,
    today,
    mode: mode.mode,
    challenge: c,
    phase,
    dayNumber: mode.day,
    brief,
    writingBrief: !loading && phase === "active" && !brief && !failed,
    flags,
    weekly,
    due,
    reviewMissing,
    history,
    busy,
    regenerate,
    writeReview,
    dismiss,
    restore,
  };
}
