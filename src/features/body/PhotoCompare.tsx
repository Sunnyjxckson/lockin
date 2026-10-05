"use client";

import { useState } from "react";
import { Camera, ChevronDown } from "lucide-react";
import { Button, Card, EmptyState, Sheet, cn } from "@/components/ui";
import { photoEntries, pickComparePhotos, type PhotoEntry } from "@/lib/logic/body";
import { dayNumber, formatDateShort } from "@/lib/logic/dates";
import { usePhoto } from "@/lib/storage/hooks";
import type { BodyLog, DateStr } from "@/lib/types";
import { fmt } from "./format";

function dayLabel(date: DateStr, startDate: DateStr | null): string {
  if (!startDate) return formatDateShort(date);
  const n = dayNumber(startDate, date);
  return n >= 1 ? `Day ${n}` : formatDateShort(date);
}

function Frame({ entry, className }: { entry: PhotoEntry | null; className?: string }) {
  const url = usePhoto(entry?.photo_url);
  return (
    <div className={cn("flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-[16px] border border-line bg-surface-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <Camera size={22} className="text-ink-3" aria-hidden />}
    </div>
  );
}

function Side({
  title,
  entry,
  startDate,
  unit,
  onPick,
  emptyText,
}: {
  title: string;
  entry: PhotoEntry | null;
  startDate: DateStr | null;
  unit: string;
  onPick: () => void;
  emptyText: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="t-label mb-2">{title}</p>
      <Frame entry={entry} />
      {entry ? (
        <button type="button" onClick={onPick} className="pressable mt-1 flex min-h-11 w-full items-center justify-between gap-1 text-left">
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">
              {dayLabel(entry.date, startDate)}, {formatDateShort(entry.date)}
            </span>
            <span className="tnum block text-[13px] text-ink-3">{entry.weight !== null ? `${fmt(entry.weight, 1)} ${unit}` : "No weight"}</span>
          </span>
          <ChevronDown size={18} className="shrink-0 text-ink-3" aria-hidden />
        </button>
      ) : (
        <p className="mt-2.5 text-[13px] text-ink-3">{emptyText}</p>
      )}
    </div>
  );
}

/** Day 1 against the latest photo, side by side. Tap a date to pick another. */
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
      <Card padded={false}>
        <EmptyState
          compact
          icon={<Camera size={22} aria-hidden />}
          title="No progress photos yet"
          body="Take one now and one each Friday. They show up here side by side."
          action={
            <Button variant="secondary" onClick={onAdd}>
              Add the first photo
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex gap-3">
        <Side title="Start" entry={before} startDate={startDate} unit={unit} onPick={() => setPicking("before")} emptyText="" />
        <Side title="Latest" entry={after} startDate={startDate} unit={unit} onPick={() => setPicking("after")} emptyText="Add another photo to compare." />
      </div>
      {before && after && before.weight !== null && after.weight !== null ? (
        <p className="tnum mt-3 border-t border-line pt-3 text-[14px] text-ink-2">
          {after.weight === before.weight
            ? "Same weight in both."
            : `${fmt(Math.abs(after.weight - before.weight), 1)} ${unit} ${after.weight < before.weight ? "down" : "up"} between these two.`}
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
                <Frame entry={p} className={selected ? "border-2 border-ink" : undefined} />
                <span className="mt-1.5 block text-[14px] font-semibold">{dayLabel(p.date, startDate)}</span>
                <span className="block text-[12px] text-ink-3">{formatDateShort(p.date)}</span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </Card>
  );
}
