"use client";

import Link from "next/link";
import { ArrowRight, Minus, X } from "lucide-react";
import { CheckMark, Sheet, cn } from "@/components/ui";
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
    <li className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
      {r.done ? (
        <CheckMark checked size={26} />
      ) : (
        <span
          aria-hidden
          className={cn(
            "inline-flex size-[26px] shrink-0 items-center justify-center rounded-full border-2",
            r.state === "off" ? "border-warn text-warn" : pending ? "border-line-strong text-ink-3" : "border-danger text-danger",
          )}
        >
          {r.state === "off" ? <Minus size={14} strokeWidth={3} /> : pending ? null : <X size={14} strokeWidth={3} />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[16px] font-medium", r.done ? "text-ink" : "text-ink")}>{r.item.name}</span>
        {detail ? <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{detail}</span> : null}
      </span>
      <span
        className={cn(
          "shrink-0 text-[13px] font-medium",
          r.done ? "text-accent" : r.state === "off" ? "text-warn" : pending ? "text-ink-3" : "text-danger",
        )}
      >
        {r.done ? "Done" : r.state === "off" ? "Off target" : pending ? "Open" : "Missed"}
      </span>
    </li>
  );
}

function Group({ title, rows, pending }: { title: string; rows: ItemResult[]; pending: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-5 first:mt-1">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="t-label">{title}</h3>
        <span className="tnum text-[13px] text-ink-3">{rows.length}</span>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface-2">
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
          <Link
            href={`/today?date=${cell.date}`}
            className="pressable flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-ink text-[16px] font-semibold text-bg"
          >
            {pending ? "Open Today" : "Open this day on Today"}
            <ArrowRight size={18} aria-hidden />
          </Link>
        ) : undefined
      }
    >
      {cell && s ? (
        <div className="pb-2">
          <div className="flex items-end justify-between rounded-[20px] border border-line bg-surface-2 px-4 py-3.5">
            <div>
              <div className="t-label">{pending ? "Today so far" : "Result"}</div>
              <div
                className={cn(
                  "mt-1 text-[20px] font-semibold",
                  cell.kind === "full" ? "text-accent" : cell.kind === "missed" ? "text-danger" : "text-ink",
                )}
              >
                {STATUS_LINE[cell.kind]}
              </div>
            </div>
            <div className="text-right">
              <span className="t-num-sm">{s.done}</span>
              <span className="ml-1 text-[15px] font-medium text-ink-3">of {s.total}</span>
            </div>
          </div>
          {s.total === 0 ? <p className="t-sub mt-4 px-1">No daily items were in the checklist on this day.</p> : null}
          <Group title={pending ? "Still open" : "Not done"} rows={notDone} pending={pending} />
          <Group title="Done" rows={done} pending={pending} />
        </div>
      ) : cell ? (
        <p className="t-sub pb-4">This day has not started yet.</p>
      ) : null}
    </Sheet>
  );
}
