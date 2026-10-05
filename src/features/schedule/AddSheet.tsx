"use client";

import { useMemo, useState } from "react";
import { Button, NumberField, SegmentedControl, Sheet, TextField, TimeField, Toggle, cn } from "@/components/ui";
import type { DayBlock } from "@/lib/blocks";
import { haptics } from "@/lib/haptics";
import { formatDuration, formatTime, minutesOf, timeFromMinutes } from "@/lib/logic/dates";
import { DAY_END, FREE_PRESETS, LENGTH_CHOICES, makeBlock, nextOpenSlot, overlapMinutes, spanOf } from "@/lib/logic/schedule";
import type { DateStr } from "@/lib/types";
import { draftId } from "./actions";
import { kindForName } from "./kinds";

export interface AddSheetProps {
  open: boolean;
  onClose: () => void;
  date: DateStr;
  blocks: readonly DayBlock[];
  /** Minutes since midnight when the day is today, else null. */
  nowMin: number | null;
  /** Set when an empty spot on the timeline was tapped. */
  startAt?: number | null;
  onAdd: (block: DayBlock) => void;
}

export function AddSheet(props: AddSheetProps) {
  if (!props.open) return null;
  return <Form {...props} />;
}

function Form({ onClose, date, blocks, nowMin, startAt, onAdd }: AddSheetProps) {
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [mode, setMode] = useState<"next" | "pick">(startAt != null ? "pick" : "next");
  const [time, setTime] = useState(() => timeFromMinutes(startAt ?? Math.min(DAY_END - 60, Math.ceil((nowMin ?? 12 * 60) / 15) * 15)));
  const [flexible, setFlexible] = useState(true);

  // Today the search starts at now. Any other day it starts at the first block.
  const from = nowMin ?? (blocks.length > 0 ? Math.min(...blocks.map((b) => spanOf(b).s)) : 6 * 60);
  const slot = useMemo(() => nextOpenSlot(blocks, minutes, from), [blocks, minutes, from]);

  const startMin = mode === "next" ? (slot?.startMin ?? null) : minutesOf(time);
  const endMin = startMin === null ? null : Math.min(DAY_END, startMin + minutes);
  const clash =
    mode === "pick" && startMin !== null
      ? blocks.filter((b) => overlapMinutes(b, { start: timeFromMinutes(startMin), duration: minutes }) > 0)
      : [];
  const label = name.trim() || "Block";

  const add = () => {
    if (startMin === null) return;
    haptics.done();
    onAdd(makeBlock({ id: draftId(), date, name: label, startMin, duration: minutes, flexible, kind: kindForName(label) }));
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add to the day"
      footer={
        <Button full size="lg" disabled={startMin === null} onClick={add}>
          {startMin === null ? "No open slot" : `Add at ${formatTime(timeFromMinutes(startMin))}`}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <TextField label="What" value={name} onChange={setName} placeholder="TV, haircut, call home" maxLength={60} />
          <div className="mt-2.5 flex flex-wrap gap-2">
            {FREE_PRESETS.map((p) => {
              const on = name === p.name;
              return (
                <button
                  key={p.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    haptics.tap();
                    setName(p.name);
                    setMinutes(p.minutes);
                  }}
                  className={cn(
                    "pressable h-11 rounded-full px-4 text-[14px] font-medium",
                    on ? "border border-ink bg-ink text-bg" : "tile text-ink",
                  )}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] text-ink-2">How long</p>
          <div className="grid grid-cols-6 gap-1.5">
            {LENGTH_CHOICES.map((m) => {
              const on = minutes === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    haptics.tap();
                    setMinutes(m);
                  }}
                  className={cn(
                    "pressable h-11 rounded-full text-[14px] font-medium",
                    on ? "border border-ink bg-ink text-bg" : "tile text-ink",
                  )}
                >
                  {m < 60 ? `${m}m` : formatDuration(m).replace(" ", "")}
                </button>
              );
            })}
          </div>
          <NumberField
            className="mt-2"
            aria-label="Length in minutes"
            value={minutes}
            onChange={(v) => setMinutes(Math.max(5, Math.min(720, v ?? 60)))}
            live
            decimal={false}
            min={0}
            max={720}
            unit="min"
          />
        </div>

        <SegmentedControl
          label="When"
          value={mode}
          onChange={setMode}
          options={[
            { value: "next", label: "Next open slot" },
            { value: "pick", label: "Pick a time" },
          ]}
        />

        {mode === "pick" ? <TimeField label="Start" value={time} onChange={setTime} /> : null}

        <div className="rounded-[20px] border border-line bg-surface-2 px-4 py-3.5" aria-live="polite" data-slot>
          {startMin !== null && endMin !== null ? (
            <>
              <p className="t-label">{mode === "next" ? (nowMin !== null ? "Next open slot" : "First open slot") : "Goes at"}</p>
              <div className="mt-1.5 flex items-baseline justify-between gap-3">
                <p className="t-num">{formatTime(timeFromMinutes(startMin))}</p>
                <p className="t-sub shrink-0">
                  to {formatTime(timeFromMinutes(endMin))}, {formatDuration(endMin - startMin)}
                </p>
              </div>
              {clash.length > 0 ? <p className="mt-2 text-[13px] text-warn">Overlaps {clash.map((b) => b.block_name).join(", ")}. Flagged, not moved.</p> : null}
            </>
          ) : (
            <>
              <p className="t-label">No open slot</p>
              <p className="t-sub mt-1.5">Nothing open for {formatDuration(minutes)}. Make it shorter or pick a time.</p>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[15px]">Flexible</p>
            <p className="t-caption mt-0.5 text-ink-2">Shifts later when something runs long</p>
          </div>
          <Toggle checked={flexible} onChange={setFlexible} label="Flexible" />
        </div>
      </div>
    </Sheet>
  );
}
