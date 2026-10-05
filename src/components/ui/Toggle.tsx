"use client";

import { haptics } from "@/lib/haptics";
import { cn } from "./cn";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Read by screen readers. Required unless the toggle sits inside a <label>. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** An on/off switch. On is ink, not the accent: on is not the same as done. */
export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptics.tap();
        onChange(!checked);
      }}
      className={cn("relative inline-flex h-11 w-[52px] shrink-0 items-center disabled:opacity-40", className)}
    >
      <span
        className={cn(
          "h-[30px] w-[52px] rounded-full transition-colors duration-200 ease-out",
          checked ? "bg-ink" : "bg-surface-3",
        )}
      />
      <span
        className={cn(
          "absolute left-[3px] size-6 rounded-full transition-transform duration-200 ease-out",
          checked ? "translate-x-[22px] bg-bg" : "translate-x-0 bg-ink-2",
        )}
      />
    </button>
  );
}
