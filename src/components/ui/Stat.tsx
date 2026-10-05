"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export interface StatProps {
  /** Uppercase label. */
  label: string;
  /** The number, already formatted. */
  value: ReactNode;
  /** Small text right after the number: "lb", "/ 30", "left". */
  unit?: string;
  /** Line under the number. */
  sub?: ReactNode;
  /** display 64px, lg 40px (default), sm 28px. */
  size?: "display" | "lg" | "sm";
  /** Paint the number in the accent. Only when the stat is a done state. */
  done?: boolean;
  align?: "left" | "center";
  className?: string;
}

/** A number with its label above it, for a card that holds one figure. */
export function Stat({ label, value, unit, sub, size = "lg", done = false, align = "left", className }: StatProps) {
  return (
    <div className={cn("flex flex-col", align === "center" && "items-center text-center", className)}>
      <span className="t-label">{label}</span>
      <span className="mt-2 flex items-baseline gap-1.5">
        <span className={cn(size === "display" ? "t-display" : size === "lg" ? "t-num" : "t-num-sm", done && "text-accent")}>{value}</span>
        {unit ? <span className="text-[14px] text-ink-2">{unit}</span> : null}
      </span>
      {sub ? <span className="t-sub mt-1.5">{sub}</span> : null}
    </div>
  );
}

export interface TrackStatProps {
  /** The number, already formatted: "3/4", "$40", "4d". */
  value: ReactNode;
  /** One word under it: "Body". */
  label: string;
  /** 0 to 1: how much of the hairline is filled. Leave out for a stat with no line. */
  progress?: number;
  /** Something here needs a look. The line is drawn in the warn color. */
  attention?: boolean;
  /** Makes it a button, for a stat that filters or opens something. */
  onClick?: () => void;
  /** With onClick: whether it is switched on. Its label turns to the accent. */
  pressed?: boolean;
  /** Read by screen readers in place of value and label. */
  "aria-label"?: string;
  className?: string;
}

/**
 * One of a row of stats: a number, one word, and a hairline that fills
 * (Today's four tracks, the three figures on Money). Put two to four in a
 * `grid grid-cols-N gap-3.5`.
 */
export function TrackStat({ value, label, progress, attention = false, onClick, pressed, className, ...aria }: TrackStatProps) {
  const p = progress === undefined || !Number.isFinite(progress) ? null : Math.min(1, Math.max(0, progress));
  const body = (
    <>
      <span className="t-stat block truncate text-ink">{value}</span>
      <span className={cn("t-label mt-1.5 block truncate text-[10px]", pressed && "text-accent")}>{label}</span>
      {p !== null ? (
        <span className="mt-2 block h-0.5 overflow-hidden rounded-full bg-hair" aria-hidden>
          <span className={cn("block h-full rounded-full", attention ? "bg-warn" : "bg-accent")} style={{ width: `${p * 100}%`, transition: "width 600ms var(--ease-out)" }} />
        </span>
      ) : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={aria["aria-label"]}
        className={cn("pressable -my-2 block min-h-11 min-w-0 py-2 text-left", className)}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={cn("min-w-0", className)} aria-label={aria["aria-label"]}>
      {body}
    </div>
  );
}

export interface BigNumberProps {
  /** The number, already formatted, without its currency sign: "140". */
  value: ReactNode;
  /** Drawn small, raised and in the accent before the number: "$". */
  prefix?: string;
  /** Drawn small after the number: "lb", "%". */
  unit?: string;
  /** Small uppercase line above. */
  label?: ReactNode;
  /** One short sentence under the number. */
  sub?: ReactNode;
  /** hero is 84px (default), the one big number on a screen. display is 64px. */
  size?: "hero" | "display";
  className?: string;
}

/** The one large number a screen leads with: "$140" toward the target, a weight, a streak. */
export function BigNumber({ value, prefix, unit, label, sub, size = "hero", className }: BigNumberProps) {
  const hero = size === "hero";
  return (
    <div className={className}>
      {label ? <p className="t-label">{label}</p> : null}
      <p className={cn(hero ? "t-hero" : "t-display", "flex items-start text-ink", label ? "mt-2.5" : null)}>
        {prefix ? <span className={cn("mr-0.5 font-medium tracking-normal text-accent", hero ? "mt-2.5 text-[30px] leading-none" : "mt-2 text-[24px] leading-none")}>{prefix}</span> : null}
        <span className="min-w-0 truncate">{value}</span>
        {unit ? <span className={cn("ml-1.5 self-end font-normal tracking-normal text-ink-2", hero ? "mb-2.5 text-[20px] leading-none" : "mb-2 text-[16px] leading-none")}>{unit}</span> : null}
      </p>
      {sub ? <p className="t-sub mt-2.5">{sub}</p> : null}
    </div>
  );
}
