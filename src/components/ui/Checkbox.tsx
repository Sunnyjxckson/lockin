"use client";

import { useState, type ReactNode } from "react";
import { haptics } from "@/lib/haptics";
import { cn } from "./cn";

export interface CheckMarkProps {
  checked: boolean;
  /**
   * Ticked but it does not count (checked after the cutoff, missing text).
   * Draws in the warn color instead of the gradient.
   */
  off?: boolean;
  /** Diameter in px. Default 30. */
  size?: number;
  className?: string;
}

/**
 * The round done tick, drawing only. When `checked` turns true it pops, draws
 * the check and sends a ring outward. Use it inside a row that handles the
 * tap itself. For a standalone control use Checkbox.
 */
export function CheckMark({ checked, off = false, size = 30, className }: CheckMarkProps) {
  // Animate a tick that happens while mounted, not one that was already there.
  const [prev, setPrev] = useState(checked);
  const [burst, setBurst] = useState(0);
  if (prev !== checked) {
    setPrev(checked);
    setBurst(checked ? burst + 1 : 0);
  }
  const fresh = checked && burst > 0;

  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }} aria-hidden>
      {fresh && !off ? (
        <span key={burst} className="animate-check-burst pointer-events-none absolute inset-0 rounded-full border-2 border-accent" />
      ) : null}
      <span
        className={cn(
          "flex size-full items-center justify-center rounded-full transition-colors duration-150",
          checked ? (off ? "bg-warn" : "grad shadow-glow") : "border-[1.5px] border-line-strong bg-transparent",
          fresh && "animate-check-pop",
        )}
      >
        {checked ? (
          <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8.4l3.2 3.1L13 4.6"
              stroke="var(--accent-ink)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={fresh ? "animate-check-draw" : undefined}
            />
          </svg>
        ) : null}
      </span>
    </span>
  );
}

export interface CheckboxProps extends CheckMarkProps {
  onChange: (checked: boolean) => void;
  /** Read by screen readers: the name of the thing being checked. */
  label: string;
  disabled?: boolean;
}

/** A tappable CheckMark with a 44px tap area and haptics. */
export function Checkbox({ checked, onChange, label, off, disabled, size = 30, className }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (checked) haptics.tap();
        else haptics.done();
        onChange(!checked);
      }}
      className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-60", className)}
    >
      <CheckMark checked={checked} off={off} size={size} />
    </button>
  );
}

export interface PillCheckProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The words on the pill: "Clean today". */
  children: ReactNode;
  disabled?: boolean;
  /** Read by screen readers in place of the words. */
  "aria-label"?: string;
  className?: string;
}

/**
 * A checkbox drawn as a pill with words on it: resting it is a tile with an
 * empty ring, done it turns to the gradient with a tick. For a yes or no that
 * reads better as a sentence than as a bare tick ("Clean today"). It
 * stretches to the room it is given.
 */
export function PillCheck({ checked, onChange, children, disabled, className, ...aria }: PillCheckProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={aria["aria-label"]}
      disabled={disabled}
      onClick={() => {
        if (checked) haptics.tap();
        else haptics.done();
        onChange(!checked);
      }}
      className={cn(
        "pressable flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border px-4 text-left text-[14px] font-medium transition-colors disabled:opacity-60",
        checked ? "grad shadow-glow border-transparent" : "tile text-ink",
        className,
      )}
    >
      {checked ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden>
          <path d="M3 8.4l3.2 3.1L13 4.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span className="size-4 shrink-0 rounded-full border-[1.5px] border-ink-3" aria-hidden />
      )}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}
