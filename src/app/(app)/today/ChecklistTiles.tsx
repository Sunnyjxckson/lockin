"use client";

// The checklist as tap tiles. One tile per item, picked by what the item is:
// a tick, a number typed in, a number that comes from somewhere else (meals,
// earnings), a line of text that is then ticked, or a vice with a slip.

import { useState, type ReactNode } from "react";
import { Flame } from "lucide-react";
import { Button, NumberTile, Sheet, TextField, Tile, type TileState } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { formatTime, nyParts } from "@/lib/logic/dates";
import { hasSlip, meetsNumber, type ItemState } from "@/lib/logic/day";
import { shortHint, shortName, shortTarget } from "@/lib/logic/tracks";
import type { ChecklistItem, DayLog, Target } from "@/lib/types";

export interface TileRowProps {
  item: ChecklistItem;
  target: Target;
  log: DayLog | null;
  state: ItemState;
  /** Days (or weeks) in a row. Shown from 2 up. */
  streak?: number;
  /** Replaces the tile's big line: the workout's kind for Workout ("Lift"). */
  value?: string;
  /** Replaces the tile's small line: the workout's name, "Done Oct 6" for a weekly item. */
  sub?: string;
  disabled: boolean;
  onCheck: (checked: boolean) => void;
  onValue: (value: number | null) => void;
  onText: (text: string) => void;
  /** A second action in the tile's corner, with its own tap target (the focus timer on Study). */
  corner?: ReactNode;
}

function streakCorner(n?: number): ReactNode {
  if (!n || n < 2) return undefined;
  return (
    <span className="tnum pointer-events-none flex items-center gap-0.5 pt-3 pr-3 text-[11px]" aria-label={`${n} in a row`}>
      <Flame size={11} aria-hidden />
      {n}
    </span>
  );
}

/** A number over its limit needs a look. A number that is only not there yet does not. */
function numberState(state: ItemState, target: Target, value: number | null): TileState {
  if (state === "done") return "done";
  if (value === null) return "off";
  const max = target.kind === "max" || target.kind === "range" ? target.max : null;
  return max !== null && value > max ? "attention" : "off";
}

/** A yes/no item. The whole tile is the tap target. */
export function CheckTile({ item, target, log, state, streak, value, sub, disabled, onCheck, corner }: TileRowProps) {
  const checked = state !== "open";
  const late = state === "off" && target.kind === "check_by";
  const vice = item.category === "vice";
  let big = value ?? shortName(item);
  let small = sub ?? shortHint(item);

  if (target.kind === "check_by" && !sub) {
    // The wake check: the time it was ticked once it is, the cutoff until then.
    const at = log?.checked && log.completed_at ? nyParts(log.completed_at) : null;
    const sameDay = at !== null && at.date === log?.date;
    if (checked && sameDay && at) big = formatTime(at.time).replace(/ (AM|PM)$/, "");
    small = late ? "After the cutoff" : checked ? item.name : `By ${formatTime(target.by)}`;
  } else if (vice && !sub) {
    small = checked ? (streak && streak >= 2 ? `Clean, ${streak} days` : "Clean") : "Clean today?";
  }

  return (
    <Tile
      value={big}
      label={small}
      state={late ? "attention" : state === "done" ? "done" : "off"}
      checked={checked}
      disabled={disabled}
      aria-label={late ? `${item.name}. Checked after the cutoff. Does not count.` : item.name}
      onClick={() => {
        if (checked) haptics.tap();
        else haptics.done();
        onCheck(!checked);
      }}
      corner={corner ?? (vice ? undefined : streakCorner(streak))}
    />
  );
}

/** A number item, typed straight into its tile. */
export function NumberEntryTile({ item, target, log, state, sub, disabled, onValue }: TileRowProps) {
  const value = log?.value ?? null;
  const done = state === "done";
  return (
    <NumberTile
      name={item.name}
      value={value}
      prefix={item.unit === "$" ? "$" : undefined}
      unit={item.unit && item.unit !== "$" ? item.unit : undefined}
      label={sub ?? (shortTarget(target, item.unit) || shortName(item))}
      state={numberState(state, target, value)}
      disabled={disabled}
      onChange={(v) => {
        // The stronger buzz is for a number that meets the target.
        if (v !== null && meetsNumber(target, v) && !done) haptics.done();
        else if (v !== null) haptics.tap();
        onValue(v);
      }}
    />
  );
}

/** A number that is added up somewhere else (calories and protein from meals). The tile shows it and links there. */
export function LinkedNumberTile({ item, target, log, state, href, from }: TileRowProps & { href: string; from: string }) {
  const value = log?.value ?? 0;
  const shown = value.toLocaleString("en-US");
  return (
    <Tile
      href={href}
      state={numberState(state, target, value)}
      aria-label={`${item.name}: ${shown}${item.unit ?? ""} from ${from}. Open Body`}
      value={
        <>
          {shown}
          {item.unit ? <span className="t-caption ml-0.5 font-normal tracking-normal opacity-80">{item.unit}</span> : null}
        </>
      }
      label={shortTarget(target, item.unit) || shortName(item)}
    />
  );
}

/**
 * Text plus a tick: write what was done, then it counts. The tile opens a
 * sheet with the line to write and one button. The tick is refused until
 * there is something written.
 */
export function TextTile(props: TileRowProps) {
  const { item, log, state, streak, sub } = props;
  const [open, setOpen] = useState(false);
  const saved = log?.text ?? "";
  const done = state === "done";
  return (
    <>
      <Tile
        value={shortName(item)}
        label={sub ?? (done ? saved : saved.trim() ? "Written, not ticked" : shortHint(item))}
        state={done ? "done" : "off"}
        aria-label={`${item.name}: ${done ? "done" : "not done"}. ${done ? "Open" : "Write what you did"}`}
        onClick={() => {
          haptics.tap();
          setOpen(true);
        }}
        corner={streakCorner(streak)}
        data-text-item={item.key ?? item.id}
      />
      {open ? <TextSheet {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Mounted only while open, so it starts from what is saved every time. */
function TextSheet({ item, log, state, disabled, onCheck, onText, onClose }: TileRowProps & { onClose: () => void }) {
  const saved = log?.text ?? "";
  const [text, setText] = useState(saved);
  const done = state === "done";
  const written = text.trim().length > 0;
  const changed = text.trim() !== saved.trim();

  return (
    <Sheet
      open
      onClose={() => {
        if (!disabled && changed) onText(text);
        onClose();
      }}
      title={item.name}
      subtitle={disabled ? "This day is locked." : "Write what you did. Then it counts."}
      footer={
        done ? (
          <Button
            variant="secondary"
            full
            disabled={disabled}
            onClick={() => {
              haptics.tap();
              if (changed) onText(text);
              onCheck(false);
              onClose();
            }}
          >
            Mark not done
          </Button>
        ) : (
          <Button
            full
            disabled={disabled || !written}
            onClick={() => {
              haptics.done();
              if (changed) onText(text);
              onCheck(true);
              onClose();
            }}
          >
            Done
          </Button>
        )
      }
    >
      <TextField
        value={text}
        onChange={setText}
        rows={3}
        maxLength={200}
        disabled={disabled}
        autoFocus={!done && !disabled}
        placeholder={item.hint ?? "What did you do?"}
        aria-label={`${item.name}: what you did`}
      />
    </Sheet>
  );
}

/**
 * A vice with a slip logged that day. It is not clean until the slip is
 * removed, so there is nothing to tick: the tile opens the vice instead.
 */
export function SlipTile({ item, log }: TileRowProps) {
  const n = log?.slips ?? 1;
  return (
    <Tile
      href={`/vices/${item.id}`}
      state="attention"
      value={shortName(item)}
      label={n > 1 ? `${n} slips, not clean` : "Not clean"}
      aria-label={`${item.name}: ${n > 1 ? `${n} slips` : "slip"} logged, not clean today. Open`}
      data-slip={item.key ?? item.id}
    />
  );
}

/** Picks the right tile for an item. */
export function ChecklistTile(props: TileRowProps) {
  if (hasSlip(props.log)) return <SlipTile {...props} />;
  if (props.item.type === "number") return <NumberEntryTile {...props} />;
  if (props.item.type === "text") return <TextTile {...props} />;
  return <CheckTile {...props} />;
}
