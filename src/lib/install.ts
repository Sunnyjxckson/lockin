// "Add to Home Screen" support. Chrome and Edge (Android and desktop) fire
// beforeinstallprompt once, early, so it is caught here at load and held
// until a screen wants to offer it. iOS Safari has no such event: there the
// user gets written steps.

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let held: InstallEvent | null = null;
let installed = false;
let listening = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of Array.from(listeners)) fn();
}

/** Start holding the browser's install event. Safe to call more than once. */
export function watchInstall(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    held = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    held = null;
    installed = true;
    emit();
  });
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but a Mac has no touch points.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

/** Other iOS browsers cannot add to the Home Screen the same way, so the steps name Safari. */
function isIOSSafari(): boolean {
  return isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
}

/**
 * How this device can install the app right now.
 * "prompt": the browser's own install prompt is ready. "ios": show the steps.
 * "ios-other": on an iPhone but not in Safari. "none": installed, or not offered here.
 */
export type InstallMode = "prompt" | "ios" | "ios-other" | "none";

export function installMode(): InstallMode {
  if (typeof window === "undefined" || installed || isStandalone()) return "none";
  if (held) return "prompt";
  if (isIOS()) return isIOSSafari() ? "ios" : "ios-other";
  return "none";
}

/** Show the browser's install prompt. Resolves true when the app was installed. */
export async function promptInstall(): Promise<boolean> {
  const e = held;
  if (!e) return false;
  held = null;
  try {
    await e.prompt();
    const choice = await e.userChoice;
    emit();
    return choice.outcome === "accepted";
  } catch {
    emit();
    return false;
  }
}
