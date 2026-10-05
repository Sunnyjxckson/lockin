"use client";

// The timer itself: set it up, run it, pause it, finish it. The same panel is
// drawn on the page and, larger, in the full screen focus view.

import { useState } from "react";
import { Maximize2, Pause, Play, Square } from "lucide-react";
import { Button, GlassCard, IconButton, ProgressBar, ProgressRing, SegmentedControl, TextField, cn, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { formatDuration } from "@/lib/logic/dates";
import { LABELS, PRESET_MINUTES, formatAway, pause, resume, type Clock, type LiveTimer } from "@/lib/logic/focus";
import { formatCountdown } from "@/lib/logic/schedule";
import { ClockText } from "./ClockText";
import { changeLive, finishTimer, startTimer } from "./store";

const LENGTHS = [{ value: 0, label: "Open" }, ...PRESET_MINUTES.map((m) => ({ value: m as number, label: String(m) }))];
const LABEL_OPTIONS = [...LABELS.map((l) => ({ value: l as string, label: l })), { value: "Other", label: "Other" }];

export function useFinish() {
  const toast = useToast();
  return async (live: LiveTimer) => {
    const res = await finishTimer(live);
    if (res.logged) {
      haptics.done();
      const away = res.meta && res.meta.away_count > 0 ? `, away ${res.meta.away_count} ${res.meta.away_count === 1 ? "time" : "times"}` : "";
      toast(`${formatDuration(res.minutes)} of focus logged${away}`, { kind: "done" });
    } else {
      toast("Under a minute. Nothing logged.");
    }
    return res;
  };
}

/** The big clock and its controls while a timer runs. */
export function RunningTimer({ live, clock, now, big, onExpand }: { live: LiveTimer; clock: Clock; /** The instant `clock` was worked out for. */ now: number; big?: boolean; onExpand?: () => void }) {
  const finish = useFinish();
  const [busy, setBusy] = useState(false);
  const countdown = clock.remaining !== null;
  const over = countdown && clock.remaining === 0;
  const low = countdown && !over && (clock.remaining ?? 0) <= 5 * 60;
  const shown = over ? clock.overBy : countdown ? (clock.remaining ?? 0) : clock.focusedSeconds;

  const done = async () => {
    setBusy(true);
    try {
      await finish(live);
    } finally {
      setBusy(false);
    }
  };

  const note = over
    ? `You hit ${formatDuration(Math.round((live.plannedSeconds ?? 0) / 60))}.`
    : clock.awayCount > 0
      ? `Left ${clock.awayCount} ${clock.awayCount === 1 ? "time" : "times"}, ${formatAway(clock.awaySeconds)} away. ${formatAway(clock.clockSeconds)} on the wall clock.`
      : clock.pausedSeconds > 0
        ? `${formatAway(clock.pausedSeconds)} paused.`
        : "Only focused time counts.";
  const long = formatCountdown(shown).length > 5;
  const time = (
    <p
      className={cn("font-medium", big ? (long ? "text-[52px] leading-none tracking-[-0.045em]" : "t-display") : "t-display mt-2", over ? "text-accent" : low ? "text-warn" : clock.paused ? "text-ink-2" : "text-ink")}
      aria-live="off"
      data-clock
    >
      {over ? "+" : ""}
      <ClockText text={formatCountdown(shown)} />
    </p>
  );
  const status = (
    <p className={cn("t-label flex items-center gap-2", over ? "text-warn" : !clock.paused && "text-accent")}>
      {clock.paused || over ? null : <span className="animate-pulse-dot size-1.5 rounded-full bg-accent" aria-hidden />}
      {over ? "Time is up" : clock.paused ? "Paused" : countdown ? "Counting down" : "Focusing"}
    </p>
  );
  const controls = (
    <div className={cn("flex gap-2", big ? "mt-8 w-full max-w-[320px]" : "mt-4")}>
      {over ? (
        <Button
          full
          variant="secondary"
          onClick={() => {
            changeLive((l) => ({ ...l, plannedSeconds: null }));
          }}
        >
          Keep going
        </Button>
      ) : (
        <Button
          full
          variant="secondary"
          icon={clock.paused ? <Play size={18} strokeWidth={1.75} aria-hidden /> : <Pause size={18} strokeWidth={1.75} aria-hidden />}
          onClick={() => {
            haptics.tap();
            // Pause at the instant on screen, so the clock does not tick once more after the tap.
            changeLive((l) => (clock.paused ? resume(l, Date.now()) : pause(l, now)));
          }}
        >
          {clock.paused ? "Resume" : "Pause"}
        </Button>
      )}
      <Button full loading={busy} icon={<Square size={16} strokeWidth={1.75} aria-hidden />} onClick={done}>
        Finish
      </Button>
    </div>
  );
  const state = over ? "over" : clock.paused ? "paused" : "live";

  // Full screen: the clock inside a thin ring that fills as a countdown runs.
  if (big) {
    return (
      <div data-timer={state} className="flex w-full flex-col items-center text-center">
        <ProgressRing value={countdown ? clock.progress : 0} size={288} stroke={3} tone={low ? "warn" : "accent"} label="Time through this session">
          <div className="flex max-w-[240px] flex-col items-center">
            {status}
            <div className="mt-3">{time}</div>
            <p className="mt-3 max-w-full truncate text-[15px] text-ink-2">{live.label}</p>
          </div>
        </ProgressRing>
        <p className="t-sub mt-6 max-w-[300px]">{note}</p>
        {controls}
      </div>
    );
  }

  return (
    <div data-timer={state}>
      <div className="flex items-center justify-between gap-3">
        {status}
        {onExpand ? (
          <IconButton label="Open focus mode" className="-my-3 -mr-2.5" onClick={onExpand}>
            <Maximize2 size={18} strokeWidth={1.75} aria-hidden />
          </IconButton>
        ) : null}
      </div>
      {time}
      <p className="mt-1 truncate text-[15px] text-ink-2">{live.label}</p>
      {countdown ? <ProgressBar value={clock.progress} tone={low ? "warn" : "accent"} className="mt-3.5" label="Time through this session" /> : null}
      <p className="t-sub mt-3">{note}</p>
      {controls}
    </div>
  );
}

/** Pick what and how long, then start. */
export function StartPanel({ onStarted, fullScreen }: { onStarted: (live: LiveTimer) => void; fullScreen: boolean }) {
  const [label, setLabel] = useState<string>("Study");
  const [custom, setCustom] = useState("");
  const [length, setLength] = useState(0);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const live = await startTimer({ label: label === "Other" ? custom : label, plannedSeconds: length > 0 ? length * 60 : null });
      haptics.done();
      onStarted(live);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard data-timer="idle">
      <p className="t-label">{length > 0 ? "Countdown" : "Count up"}</p>
      <p className="t-display mt-2 text-ink-2" data-clock>
        <ClockText text={formatCountdown(length * 60)} />
      </p>
      <div className="mt-5 space-y-2.5">
        <div role="radiogroup" aria-label="What you are working on" className="flex flex-wrap gap-2">
          {LABEL_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={label === o.value}
              onClick={() => {
                haptics.tap();
                setLabel(o.value);
              }}
              className={cn("pressable h-11 rounded-full px-4 text-[14px] font-medium", label === o.value ? "border border-ink bg-ink text-bg" : "tile text-ink-2")}
            >
              {o.label}
            </button>
          ))}
        </div>
        {label === "Other" ? <TextField value={custom} onChange={setCustom} placeholder="What is it" maxLength={40} autoFocus /> : null}
        <SegmentedControl label="Length in minutes" options={LENGTHS} value={length} onChange={setLength} />
      </div>
      <Button full size="lg" className="mt-5" loading={busy} icon={<Play size={18} strokeWidth={1.75} aria-hidden />} onClick={start}>
        {fullScreen ? "Start in focus mode" : "Start"}
      </Button>
    </GlassCard>
  );
}
