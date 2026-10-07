"use client";

// Mounted once in the app shell. While the app is open it lets the coach send
// the check-ins that are due: after the workout block, after a slip, after a
// missed item. It waits a moment after load so it never competes with the
// first screen, then looks again every few minutes, when the app comes back
// to the front, and right after a slip or a tick is logged.

import { useEffect } from "react";
import { subscribe } from "@/lib/db";
import { useToday } from "@/lib/db/hooks";

const FIRST_MS = 4000;
const EVERY_MS = 5 * 60_000;
const AFTER_WRITE_MS = 1500;

export function CheckinWatcher() {
  const today = useToday();
  useEffect(() => {
    let live = true;
    let soon: number | null = null;
    const run = () => {
      if (!live || document.visibilityState !== "visible") return;
      void import("./chat").then((m) => m.syncCheckins(today)).catch(() => undefined);
    };
    const later = (ms: number) => {
      if (soon !== null) window.clearTimeout(soon);
      soon = window.setTimeout(run, ms);
    };
    later(FIRST_MS);
    const every = window.setInterval(run, EVERY_MS);
    const onShow = () => later(AFTER_WRITE_MS);
    document.addEventListener("visibilitychange", onShow);
    const offSlip = subscribe("vice_slip", () => later(AFTER_WRITE_MS));
    return () => {
      live = false;
      if (soon !== null) window.clearTimeout(soon);
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onShow);
      offSlip();
    };
  }, [today]);
  return null;
}

export default CheckinWatcher;
