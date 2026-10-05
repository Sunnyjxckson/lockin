"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button, Select, Sheet, TextField, TimeField, Toggle } from "@/components/ui";
import type { DayBlock } from "@/lib/blocks";
import { haptics } from "@/lib/haptics";
import { formatDuration, formatTime, minutesOf, timeFromMinutes } from "@/lib/logic/dates";
import { DAY_END, MIN_BLOCK, spanOf, updateBlock, type ShiftResult } from "@/lib/logic/schedule";
import type { BlockKind } from "@/lib/types";
import { KIND_OPTIONS } from "./kinds";

export interface BlockSheetProps {
  block: DayBlock | null;
  blocks: readonly DayBlock[];
  /** True when the clock is inside this block right now. */
  live: boolean;
  /** Imported from a calendar that cannot be written: times follow Google. */
  locked?: boolean;
  onClose: () => void;
  onSave: (result: ShiftResult) => void;
  onDelete: (block: DayBlock) => void;
  onStillGoing: (block: DayBlock) => void;
}

export function BlockSheet(props: BlockSheetProps) {
  if (!props.block) return null;
  return <Form key={props.block.id} {...props} block={props.block} />;
}

function Form({ block, blocks, live, locked, onClose, onSave, onDelete, onStillGoing }: BlockSheetProps & { block: DayBlock }) {
  const span = spanOf(block);
  const [name, setName] = useState(block.block_name);
  const [start, setStart] = useState(block.start);
  const [end, setEnd] = useState(block.end);
  const [flexible, setFlexible] = useState(block.flexible);
  const [kind, setKind] = useState<BlockKind>(block.kind);
  const fromCalendar = block.source === "calendar";

  const s = minutesOf(start);
  const rawEnd = minutesOf(end);
  const e = rawEnd <= s ? DAY_END : rawEnd;
  const length = e - s;

  const result = useMemo(
    () => updateBlock(blocks, block.id, { block_name: name, start, end, flexible, kind }),
    [blocks, block.id, name, start, end, flexible, kind],
  );
  const dirty = name.trim() !== block.block_name || s !== span.s || e !== span.e || flexible !== block.flexible || kind !== block.kind;
  const names = new Map(blocks.map((b) => [b.id, b.block_name]));

  const nudgeStart = (delta: number) => {
    const ns = Math.max(0, Math.min(DAY_END - length, s + delta));
    haptics.tap();
    setStart(timeFromMinutes(ns));
    setEnd(timeFromMinutes(ns + length));
  };
  const nudgeLength = (delta: number) => {
    const ne = Math.max(s + MIN_BLOCK, Math.min(DAY_END, e + delta));
    haptics.tap();
    setEnd(timeFromMinutes(ne));
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit block"
      subtitle={fromCalendar ? "From Google Calendar. Changes go back to Google." : "This day only. The template stays as it is."}
      footer={
        <div className="flex gap-2">
          {!fromCalendar ? (
            <Button variant="danger" size="lg" aria-label="Delete block" onClick={() => onDelete(block)} icon={<Trash2 size={18} aria-hidden />} />
          ) : null}
          <Button full size="lg" disabled={!dirty} onClick={() => onSave(result)}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <TextField label="Name" value={name} onChange={setName} maxLength={60} />

        <div>
          <div className="grid grid-cols-2 gap-3">
            <TimeField label="Start" value={start} onChange={setStart} disabled={locked} />
            <TimeField label="End" value={end} onChange={setEnd} disabled={locked} />
          </div>
          {locked ? (
            <p className="t-sub mt-2">Read only. Change the time in Google Calendar.</p>
          ) : (
            <div className="mt-2.5 grid grid-cols-2 gap-3">
              <Stepper label="Move" value={formatTime(start)} onMinus={() => nudgeStart(-15)} onPlus={() => nudgeStart(15)} minus="Earlier by 15 minutes" plus="Later by 15 minutes" />
              <Stepper label="Length" value={formatDuration(length)} onMinus={() => nudgeLength(-15)} onPlus={() => nudgeLength(15)} minus="Shorter by 15 minutes" plus="Longer by 15 minutes" />
            </div>
          )}
        </div>

        {result.moved.length > 0 || result.conflicts.length > 0 ? (
          <div className="rounded-[20px] border border-line bg-surface-2 px-4 py-3.5" aria-live="polite" data-preview>
            {result.moved.length > 0 ? (
              <>
                <p className="t-label">Shifts after saving</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {result.moved.map((m) => (
                    <li key={m.id} className="flex items-baseline justify-between gap-3 text-[14px]">
                      <span className="min-w-0 truncate text-ink">{m.name}</span>
                      <span className="shrink-0 text-ink-2">
                        {formatTime(m.to.start)} to {formatTime(m.to.end)}
                        {m.cut > 0 ? `, cut ${formatDuration(m.cut)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {result.conflicts.map((c) => (
              <p key={`${c.id}-${c.withId}`} className="mt-1.5 text-[13px] text-warn">
                {names.get(c.id) ?? "This"} would overlap {names.get(c.withId) ?? "a fixed block"} by {formatDuration(c.minutes)}.
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[15px]">Flexible</p>
            <p className="t-caption mt-0.5 text-ink-2">{flexible ? "Shifts later when something runs long" : "Fixed. Never moves on its own"}</p>
          </div>
          <Toggle checked={flexible} onChange={setFlexible} label="Flexible" />
        </div>

        {!fromCalendar ? <Select label="Kind" value={kind} onChange={(v) => setKind(v as BlockKind)} options={KIND_OPTIONS} hint="Free time gets a countdown." /> : null}

        {live && !locked ? (
          <Button variant="secondary" full onClick={() => onStillGoing(block)}>
            Still going, add 15 minutes
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}

function Stepper(props: { label: string; value: string; onMinus: () => void; onPlus: () => void; minus: string; plus: string }) {
  return (
    <div className="tile flex h-[52px] items-center justify-between rounded-[16px]">
      <button type="button" aria-label={props.minus} onClick={props.onMinus} className="pressable flex size-11 items-center justify-center text-ink-2">
        <Minus size={18} strokeWidth={1.75} aria-hidden />
      </button>
      <span className="min-w-0 text-center">
        <span className="t-label block text-[10px] leading-none">{props.label}</span>
        <span className="mt-1.5 block text-[14px] leading-none font-medium text-ink">{props.value}</span>
      </span>
      <button type="button" aria-label={props.plus} onClick={props.onPlus} className="pressable flex size-11 items-center justify-center text-ink-2">
        <Plus size={18} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
