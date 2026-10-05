"use client";

// A one tap way to log a slip from Today. The checklist rows already cover
// ticking a vice as clean and show a logged slip, so this is only the entry
// point. The sheet code loads when it is first opened.

import dynamic from "next/dynamic";
import { useState } from "react";
import { useChecklist, useToday } from "@/lib/db/hooks";

const SlipSheet = dynamic(() => import("./SlipSheet").then((m) => m.SlipSheet), { ssr: false });

export default function VicesTodaySlot() {
  const today = useToday();
  const { data, loading } = useChecklist();
  const [open, setOpen] = useState(false);
  const active = data.items.filter((i) => i.category === "vice" && i.active && !i.archived);
  if (loading || active.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable flex min-h-11 items-center px-1 text-[13px] text-ink-2 underline decoration-hair underline-offset-4"
      >
        Log a slip
      </button>
      {open ? <SlipSheet vices={active} today={today} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export { VicesTodaySlot as TodaySlot };
