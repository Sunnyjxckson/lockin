"use client";

// One quiet line on Today when a quote is pinned: tap it and the lock screen
// opens in a sheet. Renders nothing otherwise. Imports no quote data, and the
// sheet loads only when opened.

import dynamic from "next/dynamic";
import { useState } from "react";
import { Smartphone } from "lucide-react";
import { cn } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { usePinned } from "./pin";

const LockScreenSheet = dynamic(() => import("./LockScreenSheet").then((m) => m.LockScreenSheet), { ssr: false });

export function LockScreenRow({ className }: { className?: string }) {
  const { pinned } = usePinned();
  const [open, setOpen] = useState(false);
  if (!pinned) return null;
  return (
    <>
      <button
        type="button"
        aria-label={`On your lock screen: ${pinned.text}`}
        onClick={() => {
          haptics.tap();
          setOpen(true);
        }}
        className={cn("pressable tile flex min-h-11 w-full items-center gap-3 rounded-[20px] px-4 py-2.5 text-left", className)}
      >
        <Smartphone size={18} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{pinned.text.replace(/\s*\n\s*/g, " ")}</span>
      </button>
      {open ? <LockScreenSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}
