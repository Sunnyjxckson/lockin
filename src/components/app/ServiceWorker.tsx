"use client";

import { useEffect } from "react";
import { watchInstall } from "@/lib/install";

/** Registers public/sw.js and starts holding the browser's install prompt. Renders nothing. */
export function ServiceWorker() {
  useEffect(() => {
    watchInstall();
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Not fatal: the app works without it, only install and push need it.
    });
  }, []);
  return null;
}
