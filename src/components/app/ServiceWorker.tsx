"use client";

import { useEffect } from "react";

/** Registers public/sw.js. Renders nothing. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Not fatal: the app works without it, only install and push need it.
    });
  }, []);
  return null;
}
