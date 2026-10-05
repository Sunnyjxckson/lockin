// Haptic feedback through navigator.vibrate where the device has it
// (Android Chrome). iOS Safari has no vibrate API, so these are silent there.
// Honors prefers-reduced-motion and the haptics switch in Settings.

let enabled = true;

/** Turn haptics on or off. Settings calls this with app_settings.haptics. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

function buzz(pattern: number | number[]): void {
  if (!enabled || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when the page has not been touched yet.
  }
}

export const haptics = {
  /** A light tap: a key press, a toggle, unticking. */
  tap: () => buzz(8),
  /** An item done. */
  done: () => buzz([12, 40, 18]),
  /** The whole day done. */
  celebrate: () => buzz([20, 50, 20, 50, 60]),
  /** Something was refused. */
  error: () => buzz([40, 60, 40]),
};
