"use client";

// Watches the app going to the background while a focus timer runs.
// Renders nothing. Mounted once, in AppShell, so it keeps watch on every
// screen and keeps this device's copy of the running timer in step with its
// row (a timer started on another phone shows up here with its pauses).
//
// A web app cannot stop the phone opening another app. What it can do is
// notice: the moment the page is hidden is written down at once, so the
// time away is known even if the tab is closed, and strict mode can end or
// void the session when the user comes back.

import { useEffect } from "react";
import { useToast } from "@/components/ui";
import { registration } from "@/features/reminders/client";
import { comeBack, formatAway, leave, staleInfo, strictBreach } from "@/lib/logic/focus";
import { changeLive, discardTimer, finishTimer, getLive, getStrict, refreshLive, writeText } from "./store";
import { useFocusTimer } from "./useFocus";

const TAG = "lockin-focus";
let mounted = 0;

async function nudge(): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const reg = await registration(1500);
  reg?.active?.postMessage({
    type: "lockin:show",
    item: { title: "Still in a focus session", body: "The clock is not counting while you are away. Come back to it.", url: "/focus", tag: TAG },
  });
}

async function clearNudge(): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const reg = await registration(1500);
    const shown = (await reg?.getNotifications({ tag: TAG })) ?? [];
    shown.forEach((n) => n.close());
  } catch {
    // Nothing to close.
  }
}

export function FocusWatcher() {
  const toast = useToast();
  useFocusTimer();

  useEffect(() => {
    mounted += 1;
    if (mounted > 1) {
      return () => {
        mounted -= 1;
      };
    }

    const onHide = () => {
      const before = getLive();
      const after = changeLive((l) => leave(l, Date.now()));
      if (after && after !== before) void nudge();
    };

    const onShow = async () => {
      const now = Date.now();
      // Another device may have paused or finished it while this one was away.
      await refreshLive();
      const live = changeLive((l) => comeBack(l, now));
      void clearNudge();
      if (!live) return;
      // Left running for hours: the screen asks what really happened.
      if (staleInfo(live, now)) return;
      const { mode, grace } = getStrict();
      const breach = strictBreach(live, mode, grace, now);
      if (!breach) return;
      if (breach.action === "void") {
        await discardTimer(live);
        writeText("focus:notice", `Session voided. You left for ${formatAway(breach.awaySeconds)} and strict mode allows ${formatAway(grace)}.`);
        toast("Session voided. You left the app.", { kind: "error" });
      } else {
        const res = await finishTimer(live, { at: breach.at });
        writeText(
          "focus:notice",
          res.logged
            ? `Session ended when you left. ${res.minutes} min logged. You were gone ${formatAway(breach.awaySeconds)}.`
            : `Session ended when you left, with under a minute on the clock. Nothing was logged.`,
        );
        toast("Session ended. You left the app.", { kind: "error" });
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
      else void onShow();
    };

    // A tab that was closed mid session left an open away behind.
    if (document.visibilityState === "visible") void onShow();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      mounted -= 1;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, [toast]);

  return null;
}

export default FocusWatcher;
