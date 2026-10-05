"use client";

import { ArrowRight, Minus, X } from "lucide-react";
import { ButtonLink, CheckMark, ProgressBar, Sheet, cn } from "@/components/ui";
import { formatDateLong } from "@/lib/logic/dates";
import type { ItemResult } from "@/lib/logic/day";
import type { GridCell } from "@/lib/logic/progress";
import { resultDetail } from "./format";

const STATUS_LINE: Record<string, string> = {
  full: "Locked in",
  partial: "Partial",
  missed: "Missed",
  open: "Nothing checked yet",
};

function Row({ r, pending }: { r: ItemResult; pending: boolean }) {
  const detail = resultDetail(r);
  return (
    <li className="flex min-h-[56px] items-center gap-3 py-2.5">
      {r.done ? (
        <CheckMark checked size={22} />
      ) : (
        <span
          aria-hidden
          className={cn(
            "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
            r.state === "off" ? "border-warn text-warn" : pending ? "border-line-strong text-ink-3" : "border-danger text-danger",
          )}
        >
          {r.state === "off" ? <Minus size={12} strokeWidth={2} /> : pending ? null : <X size={12} strokeWidth={2} />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">{r.item.name}</span>
        {detail ? <span className="t-caption mt-0.5 block text-ink-2">{detail}</span> : null}
      </span>
      <span className={cn("t-caption shrink-0", r.done ? "text-accent" : r.state === "off" ? "text-warn" : pending ? "text-ink-2" : "text-danger")}>
        {r.done ? "Done" : r.state === "off" ? "Off target" : pending ? "Open" : "Missed"}
      </span>
    </li>
  );
}

function Group({ title, rows, pending }: { title: string; rows: ItemResult[]; pending: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="t-label">{title}</h3>
        <span className="t-label">{rows.length}</span>
      </div>
      <ul className="mt-1 divide-y divide-hair">
        {rows.map((r) => (
          <Row key={r.item.id} r={r} pending={pending} />
        ))}
      </ul>
    </div>
  );
}

/** What happened on one day: exactly which items were done and which were not. */
export function DaySheet({ cell, title, onClose }: { cell: GridCell | null; /** Default: "Day N". Pass the date for a day outside a challenge. */ title?: string; onClose: () => void }) {
  const s = cell?.summary ?? null;
  const pending = !!cell?.isToday;
  const notDone = s ? s.items.filter((r) => !r.done) : [];
  const done = s ? s.items.filter((r) => r.done) : [];
  return (
    <Sheet
      open={!!cell}
      onClose={onClose}
      title={cell ? (title ?? `Day ${cell.day}`) : undefined}
      subtitle={cell ? formatDateLong(cell.date) : undefined}
      footer={
        cell && s ? (
          <ButtonLink href={`/today?date=${cell.date}`} size="lg" full iconAfter={<ArrowRight size={18} strokeWidth={1.75} aria-hidden />}>
            {pending ? "Open Today" : "Open this day on Today"}
          </ButtonLink>
        ) : undefined
      }
    >
      {cell && s ? (
        <div className="pb-2">
          <p className="t-label">{pending ? "Today so far" : STATUS_LINE[cell.kind]}</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="t-display text-ink">{s.done}</span>
            <span className="text-[18px] text-ink-2">of {s.total}</span>
          </p>
          <ProgressBar className="mt-4" value={s.total > 0 ? s.done / s.total : 0} label="Done on this day" />
          {s.total === 0 ? <p className="t-sub mt-4">No daily items were in the checklist on this day.</p> : null}
          <Group title={pending ? "Still open" : "Not done"} rows={notDone} pending={pending} />
          <Group title="Done" rows={done} pending={pending} />
        </div>
      ) : cell ? (
        <p className="t-sub pb-4">This day has not started yet.</p>
      ) : null}
    </Sheet>
  );
}
