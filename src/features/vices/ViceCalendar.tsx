"use client";

import { cn } from "@/components/ui";
import { formatDateLong, weekdayOf } from "@/lib/logic/dates";
import type { ViceDay } from "@/lib/logic/vices";

const HEAD = ["M", "T", "W", "T", "F", "S", "S"];

const LABEL: Record<ViceDay["state"], string> = {
  clean: "clean",
  slip: "slip",
  open: "nothing logged",
  off: "not tracked",
  future: "ahead",
};

function Cell({ d }: { d: ViceDay }) {
  return (
    <div
      role="img"
      aria-label={`${formatDateLong(d.date)}, ${LABEL[d.state]}`}
      className={cn(
        "relative flex aspect-square items-center justify-center rounded-[14px] border text-[14px] font-medium",
        d.state === "clean" && "grad border-transparent",
        (d.state === "slip" || d.state === "open") && "tile text-ink",
        (d.state === "off" || d.state === "future") && "border-transparent text-ink-3",
        d.isToday && d.state !== "clean" && "border-ink text-ink",
      )}
    >
      {d.day}
      {d.state === "slip" ? (
        <span className="absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-0.5" aria-hidden>
          {Array.from({ length: Math.min(3, Math.max(1, d.slips)) }, (_, i) => (
            <span key={i} className="size-1 rounded-full bg-ink-2" />
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** Clean and slip days over a run of days, Monday first so weekday patterns line up. */
export function ViceCalendar({ days }: { days: ViceDay[] }) {
  if (days.length === 0) return null;
  const lead = (weekdayOf(days[0].date) + 6) % 7;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {HEAD.map((h, i) => (
          <span key={i} className="t-caption pb-1 text-center text-ink-2" aria-hidden>
            {h}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead${i}`} />
        ))}
        {days.map((d) => (
          <Cell key={d.date} d={d} />
        ))}
      </div>
      <div className="t-caption mt-4 flex gap-5 px-1 text-ink-2">
        <span className="flex items-center gap-2">
          <span className="grad-line size-2.5 rounded-full" />
          Clean
        </span>
        <span className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-ink-2" />
          Slip
        </span>
      </div>
    </div>
  );
}
