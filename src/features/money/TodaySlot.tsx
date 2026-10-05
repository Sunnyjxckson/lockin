"use client";

// The money control for Today's "Earned today" checklist tile. It stands in
// for a typed number, so every dollar goes in through quick add and the
// earning table stays the one place the day's total comes from. The sheet
// code loads when it is first opened.

import dynamic from "next/dynamic";
import { useState } from "react";
import { Tile } from "@/components/ui";
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
  /** The small line under the amount: "of $100". */
  label?: string;
  disabled?: boolean;
}

/** The Earned tile: the day's dollars, and a tap opens quick add. */
export function EarnedAction({ date, value, done, label, disabled }: EarnedActionProps) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const last = useList("earning", { orderBy: "created_at", ascending: false, limit: 1 });
  return (
    <>
      <Tile
        value={formatMoney(value ?? 0)}
        label={label}
        state={done ? "done" : "off"}
        disabled={disabled}
        aria-label={`Add earnings. ${formatMoney(value ?? 0)} so far`}
        onClick={() => {
          haptics.tap();
          setUsed(true);
          setOpen(true);
        }}
      />
      {used ? <QuickAddSheet open={open} onClose={() => setOpen(false)} date={date} defaultApp={normalizeApp(last.data[0]?.app) ?? "DoorDash"} /> : null}
    </>
  );
}

export default EarnedAction;
