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
        "tnum relative flex aspect-square items-center justify-center rounded-[12px] text-[14px] font-semibold",
        d.state === "clean" && "bg-accent text-accent-ink",
        d.state === "slip" && "border-[1.5px] border-ink-2 text-ink",
        d.state === "open" && "bg-surface-2 text-ink-2",
        d.state === "off" && "text-ink-3",
        d.state === "future" && "border border-line text-ink-3",
        d.isToday && d.state !== "clean" && d.state !== "slip" && "border border-line-strong text-ink",
      )}
    >
      {d.day}
      {d.slips > 1 ? <span className="absolute right-1 bottom-0.5 text-[9px] font-semibold text-ink-3">x{d.slips}</span> : null}
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-[4px]", className)} />
      {label}
    </span>
  );
}

/** Clean and slip days over the challenge, Monday first so weekday patterns line up. */
export function ViceCalendar({ days }: { days: ViceDay[] }) {
  if (days.length === 0) return null;
  const lead = (weekdayOf(days[0].date) + 6) % 7;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {HEAD.map((h, i) => (
          <span key={i} className="pb-0.5 text-center text-[11px] font-medium text-ink-3">
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
      <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        <Key className="bg-accent" label="Clean" />
        <Key className="border-[1.5px] border-ink-2" label="Slip" />
        <Key className="bg-surface-2" label="Nothing logged" />
      </div>
    </div>
  );
}
