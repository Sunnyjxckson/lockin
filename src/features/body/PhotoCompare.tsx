"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { Button, EmptyState, Sheet, cn } from "@/components/ui";
import { photoEntries, pickComparePhotos, type PhotoEntry } from "@/lib/logic/body";
import { dayNumber, formatDateShort } from "@/lib/logic/dates";
import { usePhoto } from "@/lib/storage/hooks";
import type { BodyLog, DateStr } from "@/lib/types";
import { fmt, signed } from "./format";

function dayLabel(date: DateStr, startDate: DateStr | null): string {
  if (!startDate) return formatDateShort(date);
  const n = dayNumber(startDate, date);
  return n >= 1 ? `Day ${n}` : formatDateShort(date);
}

function Frame({ entry, className }: { entry: PhotoEntry | null; className?: string }) {
  const url = usePhoto(entry?.photo_url);
  return (
    <span className={cn("flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-[20px]", url ? null : "tile", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <Camera size={22} strokeWidth={1.75} className="text-ink-3" aria-hidden />}
    </span>
  );
}

function Caption({ title, entry, startDate, unit }: { title: string; entry: PhotoEntry | null; startDate: DateStr | null; unit: string }) {
  return (
    <span className="mt-3 block px-1">
      <span className="t-label block">{title}</span>
      {entry ? (
        <>
          <span className="t-value mt-1.5 block truncate text-ink">{entry.weight !== null ? `${fmt(entry.weight, 1)} ${unit}` : dayLabel(entry.date, startDate)}</span>
          <span className="t-caption mt-1 block truncate text-ink-2">
            {entry.weight !== null && startDate ? `${dayLabel(entry.date, startDate)}, ` : ""}
            {formatDateShort(entry.date)}
          </span>
        </>
      ) : null}
    </span>
  );
}

function Side({ title, entry, startDate, unit, onPick, emptyText }: { title: string; entry: PhotoEntry | null; startDate: DateStr | null; unit: string; onPick: () => void; emptyText: string }) {
  if (!entry) {
    return (
      <div className="min-w-0 flex-1">
        <Frame entry={null} />
        <Caption title={title} entry={null} startDate={startDate} unit={unit} />
        {emptyText ? <p className="t-caption mt-1.5 px-1 text-ink-2">{emptyText}</p> : null}
      </div>
    );
  }
  return (
    <button type="button" onClick={onPick} className="pressable min-w-0 flex-1 text-left" aria-label={`${title} photo, ${dayLabel(entry.date, startDate)}, ${formatDateShort(entry.date)}. Pick another`}>
      <Frame entry={entry} />
      <Caption title={title} entry={entry} startDate={startDate} unit={unit} />
    </button>
  );
}

/** The first photo against the latest, side by side. Tap one to pick another. */
export function PhotoCompare({ logs, startDate, unit, onAdd }: { logs: BodyLog[]; startDate: DateStr | null; unit: string; onAdd: () => void }) {
  const all = photoEntries(logs);
  const auto = pickComparePhotos(logs, startDate ?? undefined);
  const [beforeDate, setBeforeDate] = useState<DateStr | null>(null);
  const [afterDate, setAfterDate] = useState<DateStr | null>(null);
  const [picking, setPicking] = useState<"before" | "after" | null>(null);

  const before = all.find((p) => p.date === beforeDate) ?? auto.before;
  const after = all.find((p) => p.date === afterDate) ?? auto.after;

  if (all.length === 0) {
    return (
      <EmptyState
        compact
        icon={<Camera size={22} strokeWidth={1.75} aria-hidden />}
        title="No progress photos yet"
        body="One now, one each Friday. Same spot, same light."
        action={
          <Button variant="secondary" onClick={onAdd}>
            Add the first photo
          </Button>
        }
      />
    );
  }

  const both = before && after && before.date !== after.date && before.weight !== null && after.weight !== null;
  const change = both ? Math.round((after.weight! - before.weight!) * 10) / 10 : null;

  return (
    <div>
      <div className="flex gap-2.5">
        <Side title="Start" entry={before} startDate={startDate} unit={unit} onPick={() => setPicking("before")} emptyText="" />
        <Side title="Latest" entry={after} startDate={startDate} unit={unit} onPick={() => setPicking("after")} emptyText="Add another to compare." />
      </div>
      {change !== null ? (
        <p className="t-sub mt-4 px-1">
          <span className={cn("t-stat mr-2 align-[-2px]", change < 0 ? "text-accent" : "text-ink")}>{change === 0 ? "0" : signed(change)}</span>
          {unit} between these two
        </p>
      ) : null}

      <Sheet open={picking !== null} onClose={() => setPicking(null)} title={picking === "before" ? "Pick the start photo" : "Pick the photo to compare"}>
        <div className="grid grid-cols-3 gap-2.5">
          {all.map((p) => {
            const selected = (picking === "before" ? before : after)?.date === p.date;
            return (
              <button
                key={p.date}
                type="button"
                aria-pressed={selected}
                className="pressable text-left"
                onClick={() => {
                  if (picking === "before") setBeforeDate(p.date);
                  else setAfterDate(p.date);
                  setPicking(null);
                }}
              >
                <Frame entry={p} className={cn("rounded-[16px] border-2", selected ? "border-ink" : "border-transparent")} />
                <span className="mt-2 block text-[14px] font-medium text-ink">{dayLabel(p.date, startDate)}</span>
                <span className="t-caption block text-ink-2">{formatDateShort(p.date)}</span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
