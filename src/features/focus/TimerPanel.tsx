"use client";

// The timer itself: set it up, run it, pause it, finish it. The same panel is
// drawn on the page and, larger, in the full screen focus view.

import { useState } from "react";
import { Maximize2, Pause, Play, Square } from "lucide-react";
import { Button, Card, ProgressBar, SegmentedControl, TextField, cn, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { formatDuration } from "@/lib/logic/dates";
import { LABELS, PRESET_MINUTES, formatAway, pause, resume, type Clock, type LiveTimer } from "@/lib/logic/focus";
import { formatCountdown } from "@/lib/logic/schedule";
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
export function RunningTimer({ live, clock, big, onExpand }: { live: LiveTimer; clock: Clock; big?: boolean; onExpand?: () => void }) {
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

  return (
    <div data-timer={over ? "over" : clock.paused ? "paused" : "live"} className={cn(big && "flex w-full flex-col items-center text-center")}>
      <div className={cn("flex items-center justify-between gap-3", big && "flex-col")}>
        <p className={cn("t-label flex items-center gap-2", over && "text-warn")}>
          {clock.paused || over ? null : <span className="animate-pulse-dot size-1.5 rounded-full bg-ink" aria-hidden />}
          {over ? "Time is up" : clock.paused ? "Paused" : countdown ? "Counting down" : "Focusing"}
        </p>
        {onExpand ? (
          <button type="button" onClick={onExpand} className="pressable -my-2 flex h-11 items-center gap-1.5 text-[13px] font-semibold text-ink-2" aria-label="Open focus mode">
            <Maximize2 size={16} aria-hidden />
            Focus mode
          </button>
        ) : null}
      </div>

      <p className={cn("truncate font-medium text-ink", big ? "t-h2 mt-3 max-w-full" : "mt-1 text-[17px]")}>{live.label}</p>

      <p
        className={cn("tnum font-semibold tracking-[-0.04em]", big ? "mt-4 text-[84px] leading-none" : "t-display mt-1", low && "text-warn", clock.paused && "text-ink-2")}
        aria-live="off"
        data-clock
      >
        {over ? "+" : ""}
        {formatCountdown(shown)}
      </p>

      {countdown ? (
        <ProgressBar value={clock.progress} height={4} tone={over ? "accent" : low ? "warn" : "ink"} className={cn("mt-3", big && "w-full max-w-[280px]")} label="Time through this session" />
      ) : null}

      <p className={cn("tnum mt-3 text-[13px] text-ink-3", big && "max-w-[300px]")}>
        {over
          ? `You hit ${formatDuration(Math.round((live.plannedSeconds ?? 0) / 60))}. Finish, or keep going.`
          : clock.awayCount > 0
            ? `Left the app ${clock.awayCount} ${clock.awayCount === 1 ? "time" : "times"}, ${formatAway(clock.awaySeconds)} away. ${formatAway(clock.clockSeconds)} on the wall clock.`
            : clock.pausedSeconds > 0
              ? `${formatAway(clock.pausedSeconds)} paused. Only focused time counts.`
              : "Only focused time counts. Leaving the app is recorded."}
      </p>

      <div className={cn("mt-4 flex gap-2", big && "w-full max-w-[320px]")}>
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
            icon={clock.paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}
            onClick={() => {
              haptics.tap();
              changeLive((l) => (clock.paused ? resume(l, Date.now()) : pause(l, Date.now())));
            }}
          >
            {clock.paused ? "Resume" : "Pause"}
          </Button>
        )}
        <Button full loading={busy} icon={<Square size={16} aria-hidden />} onClick={done}>
          Finish
        </Button>
      </div>
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
    <Card data-timer="idle">
      <p className="t-label">{length > 0 ? "Countdown" : "Count up"}</p>
      <p className="t-display tnum mt-1 text-ink-2" data-clock>
        {formatCountdown(length * 60)}
      </p>
      <div className="mt-4 space-y-2">
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
              className={cn(
                "pressable h-11 rounded-[12px] border px-3.5 text-[14px] font-semibold transition-colors duration-150",
                label === o.value ? "border-ink bg-ink text-bg" : "border-line bg-surface-2 text-ink-2",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {label === "Other" ? <TextField value={custom} onChange={setCustom} placeholder="What is it" maxLength={40} autoFocus /> : null}
        <SegmentedControl label="Length in minutes" options={LENGTHS} value={length} onChange={setLength} />
      </div>
      <Button full size="lg" className="mt-4" loading={busy} icon={<Play size={18} aria-hidden />} onClick={start}>
        {fullScreen ? "Start in focus mode" : "Start"}
      </Button>
    </Card>
  );
}
