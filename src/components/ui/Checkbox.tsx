"use client";

import { useState } from "react";
import { haptics } from "@/lib/haptics";
import { cn } from "./cn";

export interface CheckMarkProps {
  checked: boolean;
  /**
   * Ticked but it does not count (checked after the cutoff, missing text).
   * Draws in the warn color instead of the accent.
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
          "flex size-full items-center justify-center rounded-full border-2 transition-colors duration-150",
          checked ? (off ? "border-warn bg-warn" : "border-accent bg-accent") : "border-line-strong bg-transparent",
          fresh && "animate-check-pop",
        )}
      >
        {checked ? (
          <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8.4l3.2 3.1L13 4.6"
              stroke="var(--accent-ink)"
              strokeWidth="2.4"
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
      className={cn("inline-flex size-11 shrink-0 items-center justify-center disabled:opacity-60", className)}
    >
      <CheckMark checked={checked} off={off} size={size} />
    </button>
  );
}
