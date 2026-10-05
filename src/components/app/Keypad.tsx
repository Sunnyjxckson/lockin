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

  const key =
    "pressable flex h-[72px] w-[72px] items-center justify-center rounded-full bg-surface text-[30px] font-medium tracking-[-0.02em] text-ink tnum active:bg-surface-3 disabled:opacity-40";

  return (
    <div className="grid grid-cols-3 justify-items-center gap-x-7 gap-y-4">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          className={key}
          onClick={() => {
            haptics.tap();
            onDigit(k);
          }}
        >
          {k}
        </button>
      ))}
      {onSubmit ? (
        <button
          type="button"
          disabled={disabled}
          className={cn(key, "bg-transparent text-[17px] font-semibold text-ink-2")}
          onClick={onSubmit}
        >
          {submitLabel}
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        disabled={disabled}
        className={key}
        onClick={() => {
          haptics.tap();
          onDigit("0");
        }}
      >
        0
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label="Delete"
        className={cn(key, "bg-transparent text-ink-2")}
        onClick={() => {
          haptics.tap();
          onDelete();
        }}
      >
        <Delete size={26} aria-hidden />
      </button>
    </div>
  );
}
