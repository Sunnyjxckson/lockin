"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";
import { NumberField } from "./Fields";

export type TileState = "off" | "done" | "attention";

export interface TileProps {
  /** The big line: a number or one short word ("5:41", "Lift", "$40"). Long text is set smaller and may take two lines. */
  value: ReactNode;
  /** The small line under it ("Up early", "of $100"). One line, cut with an ellipsis. */
  label?: ReactNode;
  /** off: resting glass. done: the gradient. attention: logged but it does not count (a slip, a late check, over a limit). */
  state?: TileState;
  /** Makes the tile a button. */
  onClick?: () => void;
  /** Makes the tile a link. */
  href?: string;
  /** Makes the tile a <label> for the control with this id (a number typed into the tile). */
  htmlFor?: string;
  /** With onClick: draws the tile as a checkbox for screen readers, ticked or not. Leave out for a plain button. */
  checked?: boolean;
  /** What a screen reader says. Needed when value and label alone do not name the thing. */
  "aria-label"?: string;
  disabled?: boolean;
  /**
   * A small thing in the top right corner: a streak count, or a second
   * action with its own tap target (the focus timer on Study). It sits
   * outside the tile's own button, so it may be a link or a button.
   */
  corner?: ReactNode;
  className?: string;
  /** Passed to the element, for example a data attribute a test looks for. */
  [data: `data-${string}`]: string | boolean | undefined;
}

const FILL: Record<TileState, string> = {
  off: "tile text-ink",
  done: "grad shadow-glow border border-transparent",
  attention: "border border-warn-line bg-warn-soft text-ink",
};

const SUB: Record<TileState, string> = {
  off: "text-ink-2",
  done: "text-accent-ink-2",
  attention: "text-warn",
};

function long(value: ReactNode): boolean {
  return typeof value === "string" && value.length > 9;
}

/**
 * A tap tile: one thing to do or one number, as a square of glass that turns
 * to the gradient when it is done. The checklist on Today is a grid of these
 * (`grid grid-cols-3 gap-2.5`). At least 80px tall, so the whole tile is a
 * comfortable tap target.
 */
export function Tile({ value, label, state = "off", onClick, href, htmlFor, checked, disabled, corner, className, ...rest }: TileProps) {
  const body = (
    <>
      <span className={cn("block min-w-0", corner ? "pr-7" : null, long(value) ? "line-clamp-2 text-[14px] leading-[1.15] font-medium tracking-[-0.02em] break-words" : "t-value truncate")}>{value}</span>
      {label !== undefined && label !== null && label !== "" ? <span className={cn("t-caption mt-1.5 block min-w-0 truncate", SUB[state])}>{label}</span> : null}
    </>
  );
  const cls = cn(
    "flex min-h-[80px] w-full min-w-0 flex-col justify-between rounded-[20px] px-3 pt-3 pb-2.5 text-left transition-[background-color,border-color,box-shadow] duration-200",
    FILL[state],
    (onClick || href) && !disabled && "pressable",
    className,
  );
  const aria = { "aria-label": rest["aria-label"] };
  const data = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith("data-")));

  let main: ReactNode;
  if (href && !disabled) {
    main = (
      <Link href={href} className={cls} {...aria} {...data}>
        {body}
      </Link>
    );
  } else if (onClick) {
    main = (
      <button type="button" onClick={onClick} disabled={disabled} role={checked === undefined ? undefined : "checkbox"} aria-checked={checked} className={cls} {...aria} {...data}>
        {body}
      </button>
    );
  } else if (htmlFor) {
    main = (
      <label htmlFor={htmlFor} className={cn(cls, "cursor-text")} {...data}>
        {body}
      </label>
    );
  } else {
    main = (
      <div className={cls} {...aria} {...data}>
        {body}
      </div>
    );
  }

  if (!corner) return main;
  return (
    <div className="relative min-w-0">
      {main}
      <div className={cn("absolute top-0 right-0 flex min-h-9 min-w-9 items-start justify-end", state === "done" ? "text-accent-ink-2" : "text-ink-2")}>{corner}</div>
    </div>
  );
}

export interface NumberTileProps {
  /** null means nothing typed yet. */
  value: number | null;
  /** Called when the user leaves the field or presses Enter. */
  onChange: (value: number | null) => void;
  /** The small line under the number: the target ("180g or more"). */
  label?: ReactNode;
  /** Shown small after the number: "g", "kcal". */
  unit?: string;
  /** Shown before the number: "$". */
  prefix?: string;
  state?: TileState;
  /** Read by screen readers: the name of what is being typed ("Protein"). */
  name: string;
  disabled?: boolean;
  decimal?: boolean;
  className?: string;
}

/** A tile you type a number into. Tap anywhere on it and the keypad opens. */
export function NumberTile({ value, onChange, label, unit, prefix, state = "off", name, disabled, decimal, className }: NumberTileProps) {
  const id = useId();
  return (
    <Tile
      htmlFor={id}
      state={state}
      label={label}
      className={className}
      value={<NumberField id={id} variant="bare" value={value} onChange={onChange} unit={unit} prefix={prefix} disabled={disabled} decimal={decimal} aria-label={name} placeholder="0" />}
    />
  );
}
