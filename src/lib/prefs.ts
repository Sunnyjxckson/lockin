// Small per-device preferences that are not app data: a dismissed prompt, a
// closed card. Kept in localStorage under their own prefix, apart from the
// tables in src/lib/db. Every call is safe when storage is missing or full.

const PREFIX = "lockin:pref:";

export function getPref(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function setPref(key: string, value: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Private mode or a full store. The preference just does not stick.
  }
}
