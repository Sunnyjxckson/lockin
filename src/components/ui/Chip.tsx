"use client";

import type { ReactNode } from "react";
import { haptics } from "@/lib/haptics";
import { cn } from "./cn";

export interface ChipProps {
  /** Whether it is chosen. A chosen chip is cream, like a chosen segment. */
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Icon before the label. */
  icon?: ReactNode;
  /** Announce it as one of a radio group (the parent row carries `role="radiogroup"`). Default is a pressed button. */
  radio?: boolean;
  disabled?: boolean;
  /** Read by screen readers in place of the label. */
  "aria-label"?: string;
  className?: string;
}

/**
 * One choice as a pill, 44px tall. Use a wrapping row of them
 * (`flex flex-wrap gap-2`) where the choices are too many or too uneven for a
 * SegmentedControl: which vice, what set it off, a quick length. Works for
 * pick one and for pick several: the parent holds what is on.
 */
export function Chip({ on, onClick, children, icon, radio = false, disabled, className, ...aria }: ChipProps) {
  return (
    <button
      type="button"
      role={radio ? "radio" : undefined}
      aria-checked={radio ? on : undefined}
      aria-pressed={radio ? undefined : on}
      aria-label={aria["aria-label"]}
      disabled={disabled}
      onClick={() => {
        haptics.tap();
        onClick();
      }}
      className={cn(
        "pressable inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] whitespace-nowrap transition-colors disabled:opacity-50",
        on ? "border-ink bg-ink font-medium text-bg" : "tile text-ink",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
