"use client";

// Compact money card for the Today screen: today's earned against the floor,
// with quick add. Self-contained, takes no props. Mount it as <MoneyTodaySlot />.

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Plus } from "lucide-react";
import { Button, Card, ProgressBar, cn } from "@/components/ui";
import { formatMoney } from "@/lib/logic/money";
import { QuickAddSheet } from "./QuickAddSheet";
import { useMoney } from "./useMoney";

export function MoneyTodaySlot({ className }: { className?: string }) {
  const m = useMoney();
  const [open, setOpen] = useState(false);
  if (m.loading) return null;
  const f = m.todayFloor;
  const done = f.met && f.earned > 0;
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center gap-3">
        <Link href="/money" className="pressable min-w-0 flex-1">
          <span className="t-label flex items-center gap-1">
            Earned today
            <ChevronRight size={14} aria-hidden />
          </span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className={cn("t-num-sm tnum", done && "text-accent")}>{formatMoney(f.earned)}</span>
            <span className="text-[14px] font-medium text-ink-3">of {formatMoney(f.floor)}</span>
            {done ? <Check size={16} className="self-center text-accent" aria-label="Floor met" /> : null}
          </span>
        </Link>
        <Button size="sm" icon={<Plus size={18} aria-hidden />} onClick={() => setOpen(true)}>
          Add
        </Button>
      </div>
      <ProgressBar className="mt-3" value={f.progress} height={6} tone={f.met ? "accent" : "ink"} label="Today against the floor" />
      <p className="mt-2 text-[13px] text-ink-3">
        {done ? (f.over > 0 ? `${formatMoney(f.over)} over the floor, banked.` : "Floor met.") : `${formatMoney(f.short)} to go.`} {formatMoney(m.total)} of {formatMoney(m.target)} overall.
      </p>
      <QuickAddSheet open={open} onClose={() => setOpen(false)} defaultApp={m.lastApp} />
    </Card>
  );
}

export default MoneyTodaySlot;
