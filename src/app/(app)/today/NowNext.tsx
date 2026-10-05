"use client";

import Link from "next/link";
import { GlassCard, ProgressBar } from "@/components/ui";
import { nowAndNext, type DayBlock } from "@/lib/blocks";
import { formatDuration, formatTime, minutesOf, timeNY } from "@/lib/logic/dates";

export interface NowNextProps {
  blocks: DayBlock[];
  now: Date;
  loading: boolean;
}

/** The current schedule block and the one after it, on the glass card Today leads with. */
export function NowNext({ blocks, now, loading }: NowNextProps) {
  if (loading) return <GlassCard className="h-[136px]" aria-busy="true" />;

  if (blocks.length === 0) {
    return (
      <GlassCard>
        <p className="t-label text-accent">Now</p>
        <p className="t-h1 mt-1.5">Nothing scheduled</p>
        <p className="t-sub mt-3">
          Add blocks for this weekday in{" "}
          <Link href="/settings/schedule" className="text-ink underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      </GlassCard>
    );
  }

  const time = timeNY(now);
  const { now: current, next, minutesLeft, minutesUntilNext } = nowAndNext(blocks, time);
  const elapsed = current ? (minutesOf(time) - minutesOf(current.start)) / Math.max(1, current.duration) : 0;
  const soon = minutesUntilNext !== null && minutesUntilNext <= 180;

  return (
    <Link href="/schedule" className="pressable block rounded-[26px]" aria-label="Open schedule">
      <GlassCard>
        <div className="flex items-baseline justify-between gap-3">
          <p className="t-label flex items-center gap-2 text-accent">
            {current ? <span className="animate-pulse-dot size-1.5 rounded-full bg-accent" aria-hidden /> : null}
            Now
          </p>
          {current ? <p className="t-sub tnum shrink-0">{formatDuration(minutesLeft ?? 0)} left</p> : null}
        </div>
        <p className="t-h1 mt-1.5 truncate">{current ? current.block_name : next ? "Open time" : "Day is done"}</p>
        <ProgressBar value={current ? elapsed : next ? 0 : 1} className="mt-3.5" label="Time through this block" />
        <div className="t-sub mt-3 flex items-baseline justify-between gap-3">
          <span className="shrink-0">Next</span>
          {next ? (
            <span className="tnum min-w-0 truncate text-right">
              {next.block_name} at {formatTime(next.start)}
              {!current && soon ? `, in ${formatDuration(minutesUntilNext)}` : ""}
            </span>
          ) : (
            <span>Nothing after this</span>
          )}
        </div>
      </GlassCard>
    </Link>
  );
}
