"use client";

import { useEffect, useState } from "react";
import { useNow } from "@/lib/db/hooks";
import { clearSchedule, postSchedule } from "./client";
import { useTodayPlan } from "./usePlan";

/**
 * Keeps the service worker holding today's reminders while the app is open.
 * Renders nothing. Mount it once, anywhere inside the app shell.
 *
 * This is the fallback for when server push is not set up, and a second line
 * when it is: the worker remembers each reminder it has shown by key, so a
 * reminder that also arrives by push is not shown twice.
 */
export function LocalScheduler() {
  const { loading, toSend } = useTodayPlan();
  const now = useNow(30_000);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const read = () => setGranted(typeof Notification !== "undefined" && Notification.permission === "granted");
    read();
    // Permission can change in browser settings while the app is in the background.
    document.addEventListener("visibilitychange", read);
    window.addEventListener("lockin:reminders-permission", read);
    return () => {
      document.removeEventListener("visibilitychange", read);
      window.removeEventListener("lockin:reminders-permission", read);
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!granted) {
      void clearSchedule();
      return;
    }
    void postSchedule(toSend, now);
  }, [loading, granted, toSend, now]);

  return null;
}
