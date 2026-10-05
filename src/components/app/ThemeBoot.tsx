"use client";

import { useLayoutEffect } from "react";
import { applyTheme, getTheme } from "@/lib/theme";

/**
 * Puts the saved theme back on the root element once React is running. The
 * inline script in the root layout already did this before first paint. This
 * covers the cases where React resets the root element's attributes after
 * that (the development remount), so the two always agree.
 */
export function ThemeBoot() {
  useLayoutEffect(() => {
    const { theme, base, palette } = getTheme();
    if (base !== "dark" || palette) applyTheme(theme);
  }, []);
  return null;
}
