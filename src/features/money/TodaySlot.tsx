"use client";

// The money control for Today's "Earned today" checklist row. It stands in
// for the row's number field, so every dollar goes in through quick add and
// the earning table stays the one place the day's total comes from. The
// sheet code loads when it is first opened.

import dynamic from "next/dynamic";
import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { formatMoney, normalizeApp } from "@/lib/logic/money";
import { useList } from "@/lib/db/hooks";
import type { DateStr } from "@/lib/types";

const QuickAddSheet = dynamic(() => import("./QuickAddSheet").then((m) => m.QuickAddSheet), { ssr: false });

export interface EarnedActionProps {
  /** The day on screen. */
  date: DateStr;
  /** The day's total from the checklist. */
  value: number | null;
  done: boolean;
  disabled?: boolean;
}

export function EarnedAction({ date, value, done, disabled }: EarnedActionProps) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const last = useList("earning", { orderBy: "created_at", ascending: false, limit: 1 });
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={`Add earnings. ${formatMoney(value ?? 0)} so far`}
        onClick={() => {
          haptics.tap();
          setUsed(true);
          setOpen(true);
        }}
        className={cn(
          "pressable tnum flex h-11 shrink-0 items-center gap-1.5 rounded-[12px] border pr-2.5 pl-3 text-[19px] font-semibold tracking-[-0.02em] disabled:opacity-70",
          done ? "border-accent-line bg-accent-soft text-accent" : "border-line bg-surface-2 text-ink",
        )}
      >
        {formatMoney(value ?? 0)}
        {disabled ? null : <Plus size={18} className={done ? "text-accent" : "text-ink-3"} aria-hidden />}
      </button>
      {used ? <QuickAddSheet open={open} onClose={() => setOpen(false)} date={date} defaultApp={normalizeApp(last.data[0]?.app) ?? "DoorDash"} /> : null}
    </>
  );
}

export default EarnedAction;
