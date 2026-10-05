"use client";

// What is happening right now on today's schedule. For a free time block it
// is a countdown, and when the time runs out it turns into an alert that
// stays until it is answered.

import { useEffect, useRef } from "react";
import { Button, GlassCard, ProgressBar, cn } from "@/components/ui";
import { nowAndNext, type DayBlock } from "@/lib/blocks";
import { haptics } from "@/lib/haptics";
import { formatDuration, formatTime, timeFromMinutes } from "@/lib/logic/dates";
import { ClockText } from "@/features/focus/ClockText";
import { formatCountdown, freeTimeFocus, timerState } from "@/lib/logic/schedule";

export interface NowCardProps {
  blocks: readonly DayBlock[];
  nowSeconds: number;
  cleared: ReadonlySet<string>;
  busy?: boolean;
  /** The block ran over: push its end out and shift what follows. */
  onStillGoing: (block: DayBlock) => void;
  /** The free time alert was answered. */
  onClear: (block: DayBlock) => void;
}

export function NowCard({ blocks, nowSeconds, cleared, busy, onStillGoing, onClear }: NowCardProps) {
  const focus = freeTimeFocus(blocks, nowSeconds, cleared);
  const alertId = focus?.timer.phase === "over" ? focus.block.id : null;
  const buzzed = useRef<string | null>(null);

  // One buzz at the moment free time runs out.
  useEffect(() => {
    if (alertId && buzzed.current !== alertId) {
      buzzed.current = alertId;
      haptics.error();
    }
  }, [alertId]);

  if (focus && focus.timer.phase === "over") {
    const b = focus.block;
    return (
      <div className="animate-shake rounded-[26px] border border-warn-line bg-warn-soft px-5 py-[18px]" role="alert" data-timer="over">
        <div className="flex items-baseline justify-between gap-3">
          <p className="t-label text-warn">Time is up</p>
          <p className="t-sub shrink-0">{focus.timer.overBy < 60 ? "Just now" : `${formatDuration(Math.floor(focus.timer.overBy / 60))} over`}</p>
        </div>
        <p className="t-h1 mt-1.5 truncate">{b.block_name}</p>
        <p className="t-sub mt-1">Ended at {formatTime(b.end)}</p>
        <div className="mt-4 flex gap-2">
          <Button full variant="solid" onClick={() => onClear(b)}>
            Done
          </Button>
          <Button full variant="secondary" disabled={busy} onClick={() => onStillGoing(b)}>
            Still going
          </Button>
        </div>
      </div>
    );
  }

  if (focus) {
    const b = focus.block;
    const low = focus.timer.remaining <= 5 * 60;
    return (
      <GlassCard data-timer="live">
        <div className="flex items-baseline justify-between gap-3">
          <p className="t-label flex items-center gap-2 text-accent">
            <span className="animate-pulse-dot size-1.5 rounded-full bg-accent" aria-hidden />
            Free time
          </p>
          <p className="t-sub shrink-0">Until {formatTime(b.end)}</p>
        </div>
        <p className={cn("t-display mt-2", low && "text-warn")} aria-live="off" data-countdown>
          <ClockText text={formatCountdown(focus.timer.remaining)} />
        </p>
        <p className="mt-1 truncate text-[15px] text-ink-2">{b.block_name}</p>
        <ProgressBar value={focus.timer.progress} tone={low ? "warn" : "accent"} className="mt-3.5" label="Time through this block" />
      </GlassCard>
    );
  }

  const time = timeFromMinutes(Math.floor(nowSeconds / 60));
  const { now, next, minutesLeft, minutesUntilNext } = nowAndNext(blocks.slice(), time);
  if (!now && !next) return null;
  const progress = now ? timerState(now, nowSeconds).progress : 0;

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-label flex items-center gap-2 text-accent">
          {now ? <span className="animate-pulse-dot size-1.5 rounded-full bg-accent" aria-hidden /> : null}
          Now
        </p>
        {now ? <p className="t-sub shrink-0">{formatDuration(minutesLeft ?? 0)} left</p> : null}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <p className="t-h1 min-w-0 truncate">{now ? now.block_name : "Open time"}</p>
        {now ? (
          <Button variant="secondary" size="sm" className="-my-1" disabled={busy} onClick={() => onStillGoing(now)}>
            Still going
          </Button>
        ) : null}
      </div>
      <ProgressBar value={progress} className="mt-3.5" label="Time through this block" />
      <div className="t-sub mt-3 flex items-baseline justify-between gap-3">
        <span className="shrink-0">Next</span>
        {next ? (
          <span className="min-w-0 truncate text-right">
            {next.block_name} at {formatTime(next.start)}
            {!now && minutesUntilNext !== null && minutesUntilNext <= 180 ? `, in ${formatDuration(minutesUntilNext)}` : ""}
          </span>
        ) : (
          <span>Nothing after this</span>
        )}
      </div>
    </GlassCard>
  );
}
