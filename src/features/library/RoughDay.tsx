"use client";

// A quiet way in from Today for a hard moment: pick how it is going and land
// in the Library reader on quotes you have not read for that. This file holds
// only the button and the picker. It imports no quote data, so Today's first
// load does not grow. The sheet loads when it is first opened.

import dynamic from "next/dynamic";
import { useState } from "react";
import { haptics } from "@/lib/haptics";

const MomentSheet = dynamic(() => import("./MomentSheet").then((m) => m.MomentSheet), { ssr: false });

export default function RoughDayEntry() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptics.tap();
          setOpen(true);
        }}
        className="pressable flex min-h-11 items-center px-1 text-[13px] text-ink-2 underline decoration-hair underline-offset-4"
      >
        Rough day
      </button>
      {open ? <MomentSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}
