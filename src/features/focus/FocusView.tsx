"use client";

// Focus mode: the timer and nothing else. Full screen where the browser
// allows it, and the screen is kept awake while it is open.
//
// This does not lock the phone. Only the phone's own settings can block
// another app. What this view does is remove everything else from the app,
// stop the screen from sleeping, and leave the watcher to record every exit.

import { useEffect, useRef, useState } from "react";
import { Minimize2 } from "lucide-react";
import type { Clock, LiveTimer } from "@/lib/logic/focus";
import { RunningTimer } from "./TimerPanel";

interface WakeLockLike {
  release: () => Promise<void>;
}

function useWakeLock(on: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!on) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> } };
    if (!nav.wakeLock) return;
    let lock: WakeLockLike | null = null;
    let live = true;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await nav.wakeLock!.request("screen");
        if (!live) {
          void next.release();
          return;
        }
        lock = next;
        setHeld(true);
      } catch {
        // Low battery or the browser said no. The timer still runs.
        setHeld(false);
      }
    };
    // The lock is dropped whenever the page is hidden, so take it again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => null);
      setHeld(false);
    };
  }, [on]);
  return held;
}

export function FocusView({ live, clock, now, onClose }: { live: LiveTimer; clock: Clock; now: number; onClose: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const awake = useWakeLock(true);

  // Full screen has to start from a tap, which is how this view was opened.
  useEffect(() => {
    const el = frame.current;
    if (el && el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen({ navigationUI: "hide" }).catch(() => null);
    }
    return () => {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => null);
    };
  }, []);

  return (
    <div
      ref={frame}
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
      data-focus-view
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-bg px-5 pt-[calc(var(--safe-t)+12px)] pb-[calc(var(--safe-b)+20px)]"
    >
      <div className="flex items-center justify-between">
        <p className="t-label">Focus mode</p>
        <button type="button" onClick={onClose} className="pressable -mr-2 flex h-11 items-center gap-1.5 px-2 text-[13px] font-semibold text-ink-2">
          <Minimize2 size={16} aria-hidden />
          Exit
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <RunningTimer live={live} clock={clock} now={now} big />
      </div>
      <p className="mx-auto max-w-[300px] text-center text-[13px] text-ink-3">
        {awake ? "Screen stays on. " : ""}
        Leave this app and the time away is recorded. Turn on your phone&apos;s own Focus to block the rest.
      </p>
    </div>
  );
}

export default FocusView;
