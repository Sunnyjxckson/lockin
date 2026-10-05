"use client";

import Link from "next/link";
import { Card, ProgressBar } from "@/components/ui";
import { nowAndNext, type DayBlock } from "@/lib/blocks";
import { formatDuration, formatTime, minutesOf, timeNY } from "@/lib/logic/dates";

export interface NowNextProps {
  blocks: DayBlock[];
  now: Date;
  loading: boolean;
}

/** The current schedule block and the one after it. */
export function NowNext({ blocks, now, loading }: NowNextProps) {
  if (loading) return <Card className="h-[132px]" aria-busy="true" />;

  if (blocks.length === 0) {
    return (
      <Card>
        <p className="t-label">Now</p>
        <p className="t-h2 mt-2">Nothing scheduled</p>
        <p className="t-sub mt-1">
          Add blocks for this weekday in{" "}
          <Link href="/settings/schedule" className="text-ink underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      </Card>
    );
  }

  const time = timeNY(now);
  const { now: current, next, minutesLeft, minutesUntilNext } = nowAndNext(blocks, time);
  const elapsed = current ? (minutesOf(time) - minutesOf(current.start)) / Math.max(1, current.duration) : 0;

  return (
    <Link href="/schedule" className="pressable block rounded-[20px]" aria-label="Open schedule">
      <Card padded={false}>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <p className="t-label flex items-center gap-2">
              {current ? <span className="animate-pulse-dot size-1.5 rounded-full bg-ink" aria-hidden /> : null}
              Now
            </p>
            {current ? (
              <p className="tnum text-[13px] text-ink-2">
                {formatTime(current.start)} to {formatTime(current.end)}
              </p>
            ) : null}
          </div>
          {current ? (
            <>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <p className="t-h2 min-w-0 truncate">{current.block_name}</p>
                <p className="tnum shrink-0 text-[15px] font-medium text-ink-2">{formatDuration(minutesLeft ?? 0)} left</p>
              </div>
              <ProgressBar value={elapsed} height={4} tone="ink" className="mt-3" label="Time through this block" />
            </>
          ) : (
            <p className="t-h2 mt-2">{next ? "Open time" : "Day is done"}</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="t-label shrink-0">Next</p>
          {next ? (
            <p className="min-w-0 truncate text-[15px]">
              <span className="font-medium text-ink">{next.block_name}</span>
              <span className="tnum text-ink-2">
                {"  "}
                {formatTime(next.start)}
                {minutesUntilNext !== null && minutesUntilNext <= 180 ? `, in ${formatDuration(minutesUntilNext)}` : ""}
              </span>
            </p>
          ) : (
            <p className="text-[15px] text-ink-2">Nothing after this</p>
          )}
        </div>
      </Card>
    </Link>
  );
}
