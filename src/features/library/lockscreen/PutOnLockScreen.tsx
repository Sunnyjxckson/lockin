"use client";

// "Put on lock screen", the one action every place a quote shows carries. It
// pins the quote and opens the lock screen so the wallpaper can be saved. A
// quote already pinned shows as on, and a tap opens the lock screen.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Smartphone } from "lucide-react";
import { cn, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { isPinned } from "@/lib/logic/lockscreen";
import { pinLibraryQuote, pinProblem, pinQuote, usePinned, type PinResult } from "./pin";

export interface PutOnLockScreenProps {
  /** The library quote id. Words and name are loaded from it when `text` is left out. */
  quoteId?: string | null;
  writer?: string | null;
  text?: string;
  by?: string;
  className?: string;
}

export const LOCKSCREEN_HREF = "/library/lockscreen";

export function PutOnLockScreen({ quoteId = null, writer = null, text, by, className }: PutOnLockScreenProps) {
  const router = useRouter();
  const toast = useToast();
  const { pinned } = usePinned();
  const [busy, setBusy] = useState(false);
  const on = isPinned(pinned, { quote_id: quoteId, text });

  const tap = async () => {
    if (busy) return;
    if (on) {
      router.push(LOCKSCREEN_HREF);
      return;
    }
    setBusy(true);
    try {
      let result: PinResult;
      if (text !== undefined) result = await pinQuote({ text, by, quote_id: quoteId });
      else if (quoteId) result = await pinLibraryQuote(quoteId, writer);
      else result = { ok: false, reason: "empty" };
      if (result.ok) {
        haptics.done();
        router.push(LOCKSCREEN_HREF);
      } else {
        haptics.error();
        toast(pinProblem(result.reason), { kind: "error" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void tap()}
      disabled={busy}
      className={cn("pressable t-caption inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-ink-2", className)}
    >
      {on ? <Check size={15} strokeWidth={1.75} aria-hidden /> : <Smartphone size={15} strokeWidth={1.75} aria-hidden />}
      {on ? "On your lock screen" : "Put on lock screen"}
    </button>
  );
}
