"use client";

import { useEffect } from "react";
import { Delete } from "lucide-react";
import { haptics } from "@/lib/haptics";
import { cn } from "@/components/ui";

export interface KeypadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  /** Shown bottom left when given, for example an OK key. */
  onSubmit?: () => void;
  submitLabel?: string;
  disabled?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Number pad for the lock screen. Also listens to the hardware keyboard. */
export function Keypad({ onDigit, onDelete, onSubmit, submitLabel = "OK", disabled }: KeypadProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      if (/^[0-9]$/.test(e.key)) onDigit(e.key);
      else if (e.key === "Backspace") onDelete();
      else if (e.key === "Enter") onSubmit?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDigit, onDelete, onSubmit, disabled]);

  // Tiles, three across, the same shape as the checklist on Today: the keypad is the first thing touched on every open.
  const key = "pressable flex h-[66px] w-full items-center justify-center rounded-[20px] text-[26px] font-medium tracking-[-0.03em] text-ink disabled:text-ink-3";
  const digit = (k: string) => (
    <button
      key={k}
      type="button"
      disabled={disabled}
      className={cn(key, "glass")}
      onClick={() => {
        haptics.tap();
        onDigit(k);
      }}
    >
      {k}
    </button>
  );

  return (
    <div className="grid grid-cols-3 gap-2.5">
      {KEYS.map(digit)}
      {onSubmit ? (
        <button type="button" disabled={disabled} className={cn(key, "text-[16px] tracking-[-0.01em] text-ink-2")} onClick={onSubmit}>
          {submitLabel}
        </button>
      ) : (
        <span />
      )}
      {digit("0")}
      <button
        type="button"
        disabled={disabled}
        aria-label="Delete"
        className={cn(key, "text-ink-2")}
        onClick={() => {
          haptics.tap();
          onDelete();
        }}
      >
        <Delete size={22} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
