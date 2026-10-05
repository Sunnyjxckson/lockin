"use client";

// What is happening right now on today's schedule. For a free time block it
// is a countdown, and when the time runs out it turns into an alert that
// stays until it is answered.

import { useEffect, useRef } from "react";
import { Button, Card, ProgressBar, cn } from "@/components/ui";
import { nowAndNext, type DayBlock } from "@/lib/blocks";
import { haptics } from "@/lib/haptics";
import { formatDuration, formatTime, timeFromMinutes } from "@/lib/logic/dates";
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
      <Card className="animate-shake border-warn bg-warn-soft" role="alert" data-timer="over">
        <p className="t-label text-warn">Time is up</p>
        <p className="t-h2 mt-2">{b.block_name} ended at {formatTime(b.end)}</p>
        <p className="tnum t-sub mt-1">{focus.timer.overBy < 60 ? "Just now" : `${formatDuration(Math.floor(focus.timer.overBy / 60))} over`}</p>
        <div className="mt-4 flex gap-2">
          <Button full onClick={() => onClear(b)}>
            Done
          </Button>
          <Button full variant="secondary" disabled={busy} onClick={() => onStillGoing(b)}>
            Still going
          </Button>
        </div>
      </Card>
    );
  }

  if (focus) {
    const b = focus.block;
    const low = focus.timer.remaining <= 5 * 60;
    return (
      <Card data-timer="live">
        <div className="flex items-center justify-between">
          <p className="t-label flex items-center gap-2">
            <span className="animate-pulse-dot size-1.5 rounded-full bg-ink" aria-hidden />
            Free time
          </p>
          <p className="tnum text-[13px] text-ink-2">
            {formatTime(b.start)} to {formatTime(b.end)}
          </p>
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="t-h2 min-w-0 truncate pb-1.5">{b.block_name}</p>
          <p className={cn("t-display shrink-0", low && "text-warn")} aria-live="off" data-countdown>
            {formatCountdown(focus.timer.remaining)}
          </p>
        </div>
        <ProgressBar value={focus.timer.progress} height={4} tone={low ? "warn" : "ink"} className="mt-3" label="Time through this block" />
        <p className="mt-3 text-[13px] text-ink-3">When this hits zero the block is over. Stretch it only if you mean to.</p>
      </Card>
    );
  }

  const time = timeFromMinutes(Math.floor(nowSeconds / 60));
  const { now, next, minutesLeft, minutesUntilNext } = nowAndNext(blocks.slice(), time);
  if (!now && !next) return null;
  const progress = now ? timerState(now, nowSeconds).progress : 0;

  return (
    <Card padded={false}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <p className="t-label flex items-center gap-2">
            {now ? <span className="animate-pulse-dot size-1.5 rounded-full bg-ink" aria-hidden /> : null}
            Now
          </p>
          {now ? (
            <p className="tnum text-[13px] text-ink-2">
              {formatTime(now.start)} to {formatTime(now.end)}
            </p>
          ) : null}
        </div>
        {now ? (
          <>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="t-h2 truncate">{now.block_name}</p>
                <p className="tnum t-sub mt-0.5">{formatDuration(minutesLeft ?? 0)} left</p>
              </div>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => onStillGoing(now)}>
                Still going
              </Button>
            </div>
            <ProgressBar value={progress} height={4} tone="ink" className="mt-3" label="Time through this block" />
          </>
        ) : (
          <p className="t-h2 mt-2">Open time</p>
        )}
      </div>
      {next ? (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="t-label shrink-0">Next</p>
          <p className="min-w-0 truncate text-[15px]">
            <span className="font-medium text-ink">{next.block_name}</span>
            <span className="tnum text-ink-2">
              {"  "}
              {formatTime(next.start)}
              {minutesUntilNext !== null && minutesUntilNext <= 180 ? `, in ${formatDuration(minutesUntilNext)}` : ""}
            </span>
          </p>
        </div>
      ) : null}
    </Card>
  );
}
