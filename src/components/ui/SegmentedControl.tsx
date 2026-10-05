"use client";

import { haptics } from "@/lib/haptics";
import { cn } from "./cn";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string | number> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Read by screen readers: what is being chosen. */
  label?: string;
  /** sm draws 36px tall for dense rows such as weekday pickers, and still takes taps over 44px. Default md, 44px. */
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

/** A row of mutually exclusive choices. Always full width, equal segments. The chosen one is a cream pill, like the tab bar. */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = "md",
  disabled,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("tile flex w-full gap-1 rounded-full px-1", size === "md" && "py-1", disabled && "opacity-50", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          // The button is the tap target, always 44px tall. The pill inside it is what is drawn: 44px, or 36px for sm.
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => {
              if (on) return;
              haptics.tap();
              onChange(o.value);
            }}
            className="flex h-11 min-w-0 flex-1 items-center rounded-full"
          >
            <span
              className={cn(
                "block w-full truncate rounded-full px-1 text-center text-[14px] font-medium transition-colors duration-150",
                size === "md" ? "h-11 leading-[44px]" : "h-9 leading-9",
                on ? "bg-ink text-bg" : "text-ink-2",
              )}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
