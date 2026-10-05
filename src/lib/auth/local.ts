// Device passcode, used when LOCKIN_PASSCODE is not set on the server.
// The passcode is never stored, only a salted SHA-256 of it, on this device.
// It keeps the app closed to someone holding the phone. It is not encryption.

const HASH_KEY = "lockin:passcode";
const UNLOCK_KEY = "lockin:unlocked_until";
const UNLOCK_DAYS = 30;

interface Stored {
  salt: string;
  hash: string;
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPasscode(passcode: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${passcode}`);
  return hex(await globalThis.crypto.subtle.digest("SHA-256", data));
}

function read(): Stored | null {
  try {
    const raw = window.localStorage.getItem(HASH_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored>;
    return typeof v.salt === "string" && typeof v.hash === "string" ? { salt: v.salt, hash: v.hash } : null;
  } catch {
    return null;
  }
}

export function hasLocalPasscode(): boolean {
  return read() !== null;
}

export async function createLocalPasscode(passcode: string): Promise<void> {
  const salt = globalThis.crypto.randomUUID();
  const stored: Stored = { salt, hash: await hashPasscode(passcode, salt) };
  window.localStorage.setItem(HASH_KEY, JSON.stringify(stored));
  rememberUnlock();
}

export async function checkLocalPasscode(passcode: string): Promise<boolean> {
  const stored = read();
  if (!stored) return false;
  const ok = (await hashPasscode(passcode, stored.salt)) === stored.hash;
  if (ok) rememberUnlock();
  return ok;
}

function rememberUnlock(): void {
  window.localStorage.setItem(UNLOCK_KEY, String(Date.now() + UNLOCK_DAYS * 86_400_000));
}

export function isLocallyUnlocked(): boolean {
  const until = Number(window.localStorage.getItem(UNLOCK_KEY) ?? 0);
  return hasLocalPasscode() && Number.isFinite(until) && until > Date.now();
}

export function lockLocally(): void {
  window.localStorage.removeItem(UNLOCK_KEY);
}
