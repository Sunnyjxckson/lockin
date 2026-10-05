"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BellRing, ChevronRight, Share, SquarePlus, X } from "lucide-react";
import { Button, Sheet } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { installMode, promptInstall, subscribeInstall, type InstallMode } from "@/lib/install";
import { getPref, setPref } from "@/lib/prefs";

const INSTALL_KEY = "install-dismissed";
const REMIND_KEY = "reminders-dismissed";

function notificationsUnanswered(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && Notification.permission === "default";
}

/**
 * One quiet setup row for Today, at most one at a time: add the app to the
 * Home Screen first (on an iPhone push needs it), then turn reminders on.
 * Each can be dismissed, and a dismissal is remembered on this device.
 * Renders nothing once both are done or dismissed.
 */
export function SetupRow({ className }: { className?: string }) {
  const mode = useSyncExternalStore<InstallMode>(subscribeInstall, installMode, () => "none");
  const [dismissed, setDismissed] = useState(() => ({ install: getPref(INSTALL_KEY) === "1", remind: getPref(REMIND_KEY) === "1" }));
  const [steps, setSteps] = useState(false);
  const [askReminders] = useState(notificationsUnanswered);

  const dismiss = (which: "install" | "remind") => {
    haptics.tap();
    setPref(which === "install" ? INSTALL_KEY : REMIND_KEY, "1");
    setDismissed((d) => ({ ...d, [which]: true }));
  };

  const row = "tile flex min-h-[56px] items-center gap-1 rounded-[20px] pl-4";
  const main = "pressable flex min-h-[52px] min-w-0 flex-1 items-center gap-3 text-left";

  if (mode !== "none" && !dismissed.install) {
    return (
      <div className={className}>
        <div className={row}>
          <button
            type="button"
            className={main}
            onClick={() => {
              if (mode === "prompt") void promptInstall();
              else setSteps(true);
            }}
          >
            <SquarePlus size={20} className="shrink-0 text-ink-2" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-ink">Add to Home Screen</span>
              <span className="t-caption mt-0.5 block truncate text-ink-2">Opens like an app. Needed for reminders on iPhone.</span>
            </span>
          </button>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss("install")} className="pressable flex size-11 shrink-0 items-center justify-center text-ink-2">
            <X size={18} aria-hidden />
          </button>
        </div>
        <Sheet
          open={steps}
          onClose={() => setSteps(false)}
          title="Add to Home Screen"
          subtitle={mode === "ios-other" ? "On an iPhone this only works from Safari. Open this page in Safari first." : "Three taps in Safari."}
          footer={
            <Button size="lg" full onClick={() => setSteps(false)}>
              Got it
            </Button>
          }
        >
          <ol className="flex flex-col gap-4 pb-2">
            <li className="flex items-center gap-3.5">
              <span className="tile flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2">
                <Share size={18} aria-hidden />
              </span>
              <span className="text-[15px]">Tap the Share button in the toolbar.</span>
            </li>
            <li className="flex items-center gap-3.5">
              <span className="tile flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2">
                <SquarePlus size={18} aria-hidden />
              </span>
              <span className="text-[15px]">Scroll down and tap Add to Home Screen.</span>
            </li>
            <li className="flex items-center gap-3.5">
              <span className="tile tnum flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] text-ink-2">3</span>
              <span className="text-[15px]">Tap Add, then open Lock In from the new icon.</span>
            </li>
          </ol>
        </Sheet>
      </div>
    );
  }

  if (askReminders && !dismissed.remind) {
    return (
      <div className={className}>
        <div className={row}>
          <Link href="/reminders" className={main}>
            <BellRing size={20} className="shrink-0 text-ink-2" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-ink">Turn on reminders</span>
              <span className="t-caption mt-0.5 block truncate text-ink-2">Wake, workout, delivery, check-in</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
          </Link>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss("remind")} className="pressable flex size-11 shrink-0 items-center justify-center text-ink-2">
            <X size={18} aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
