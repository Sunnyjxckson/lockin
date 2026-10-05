"use client";

// A one tap way to log a slip from Today. The checklist already covers
// ticking a vice as clean, so this only adds the slip entry.

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useVices } from "./data";
import { useViceSheets } from "./ViceToday";

export default function VicesTodaySlot() {
  const data = useVices();
  const sheets = useViceSheets(data.library, data.today);
  if (data.loading || data.active.length === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <button type="button" onClick={() => sheets.logSlip()} className="pressable min-h-11 text-[15px] font-medium text-ink-2 underline decoration-line-strong underline-offset-4">
        Log a slip
      </button>
      <Link href="/vices" className="pressable flex min-h-11 items-center gap-0.5 text-[14px] text-ink-3">
        Vices
        <ChevronRight size={16} aria-hidden />
      </Link>
      {sheets.node}
    </div>
  );
}

export { VicesTodaySlot as TodaySlot };
