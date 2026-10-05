"use client";

import { useEffect, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { CheckMark, NumberField, cn } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import type { ItemState } from "@/lib/logic/day";
import { describeTarget } from "@/lib/logic/targets";
import type { ChecklistItem, DayLog, Target } from "@/lib/types";

export interface RowProps {
  item: ChecklistItem;
  target: Target;
  log: DayLog | null;
  state: ItemState;
  /** Days (or weeks) in a row. Shown from 2 up. */
  streak?: number;
  /** Replaces the default secondary line. */
  sub?: string;
  disabled: boolean;
  onCheck: (checked: boolean) => void;
  onValue: (value: number | null) => void;
  onText: (text: string) => void;
  /** Called when a tick is refused because the text is empty. */
  onNeedText?: () => void;
}

function StreakChip({ n }: { n?: number }) {
  if (!n || n < 2) return null;
  return (
    <span className="tnum flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-ink-3" aria-label={`${n} in a row`}>
      <Flame size={13} aria-hidden />
      {n}
    </span>
  );
}

function Sub({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  if (!children) return null;
  return <span className={cn("mt-0.5 block truncate text-[13px]", warn ? "text-warn" : "text-ink-3")}>{children}</span>;
}

/** A yes/no item. The whole row is the tap target. */
export function CheckRow({ item, target, state, streak, sub, disabled, onCheck }: RowProps) {
  const checked = state !== "open";
  const late = state === "off" && target.kind === "check_by";
  const line = late ? "Checked after the cutoff. Does not count." : (sub ?? item.hint ?? describeTarget(target, item.unit));
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        if (checked) haptics.tap();
        else haptics.done();
        onCheck(!checked);
      }}
      className="flex min-h-[64px] w-full items-center gap-3.5 px-4 py-2.5 text-left transition-colors active:bg-surface-2 disabled:active:bg-transparent"
    >
      <CheckMark checked={checked} off={state === "off"} />
      <span className="min-w-0 flex-1">
        <span className={cn("line-clamp-2 text-[17px] leading-snug font-medium tracking-[-0.01em]", state === "done" ? "text-ink-2" : "text-ink")}>
          {item.name}
        </span>
        <Sub warn={late}>{line}</Sub>
      </span>
      <StreakChip n={streak} />
    </button>
  );
}

/** A number item with its field inline. */
export function NumberRow({ item, target, log, state, streak, sub, disabled, onValue }: RowProps) {
  const done = state === "done";
  const prefix = item.unit === "$" ? "$" : undefined;
  const unit = item.unit && item.unit !== "$" ? item.unit : undefined;
  return (
    <div className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5">
      <CheckMark checked={done} />
      <label htmlFor={`num-${item.id}`} className="min-w-0 flex-1">
        <span className={cn("line-clamp-2 text-[17px] leading-snug font-medium tracking-[-0.01em]", done ? "text-ink-2" : "text-ink")}>
          {item.name}
        </span>
        <Sub>{sub ?? describeTarget(target, item.unit)}</Sub>
      </label>
      <StreakChip n={streak} />
      <NumberField
        id={`num-${item.id}`}
        variant="inline"
        value={log?.value ?? null}
        onChange={(v) => {
          if (v !== null) haptics.tap();
          onValue(v);
        }}
        prefix={prefix}
        unit={unit}
        done={done}
        disabled={disabled}
        aria-label={item.name}
        placeholder="0"
      />
    </div>
  );
}

/** Text plus yes/no: write what was done, then tick it. */
export function TextRow({ item, log, state, streak, disabled, onCheck, onText, onNeedText }: RowProps) {
  const [text, setText] = useState(log?.text ?? "");
  const input = useRef<HTMLInputElement>(null);
  const editing = useRef(false);
  const saved = log?.text ?? "";

  useEffect(() => {
    if (!editing.current) setText(saved);
  }, [saved]);

  const done = state === "done";
  const commit = () => {
    editing.current = false;
    if (text.trim() !== saved) onText(text);
  };

  return (
    <div className="px-4 py-2.5">
      <div className="flex min-h-[44px] items-center gap-3.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={item.name}
          disabled={disabled}
          onClick={() => {
            if (done) {
              haptics.tap();
              onCheck(false);
              return;
            }
            if (text.trim().length === 0) {
              haptics.error();
              input.current?.focus();
              onNeedText?.();
              return;
            }
            haptics.done();
            if (text.trim() !== saved) onText(text);
            onCheck(true);
          }}
          className="-m-[7px] flex size-11 shrink-0 items-center justify-center"
        >
          <CheckMark checked={done} />
        </button>
        <span className="min-w-0 flex-1">
          <span className={cn("line-clamp-2 text-[17px] leading-snug font-medium tracking-[-0.01em]", done ? "text-ink-2" : "text-ink")}>
            {item.name}
          </span>
          <Sub>{item.hint}</Sub>
        </span>
        <StreakChip n={streak} />
      </div>
      <input
        ref={input}
        type="text"
        value={text}
        disabled={disabled}
        enterKeyHint="done"
        maxLength={200}
        placeholder="What did you do?"
        aria-label={`${item.name}: what you did`}
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="mt-2 mb-1 ml-[44px] h-11 w-[calc(100%-44px)] rounded-[12px] border border-line bg-surface-2 px-3 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-ink-3 disabled:opacity-70"
      />
    </div>
  );
}

/** Picks the right row for an item type. */
export function ChecklistRow(props: RowProps) {
  if (props.item.type === "number") return <NumberRow {...props} />;
  if (props.item.type === "text") return <TextRow {...props} />;
  return <CheckRow {...props} />;
}
