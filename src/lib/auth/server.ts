// Server side passcode check. Import only from route handlers and server code.
//
// When LOCKIN_PASSCODE is set, a correct passcode sets an httpOnly cookie
// holding an HMAC of a fixed message keyed by the passcode. Changing the
// passcode invalidates every session.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "lockin_session";
const SESSION_DAYS = 30;

export function serverPasscode(): string | null {
  const p = process.env.LOCKIN_PASSCODE;
  return p && p.trim().length > 0 ? p.trim() : null;
}

function sessionToken(passcode: string): string {
  return createHmac("sha256", passcode).update("lockin-session-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passcodeMatches(attempt: string): boolean {
  const real = serverPasscode();
  if (!real) return false;
  // Compare digests so length does not leak.
  return safeEqual(sessionToken(attempt), sessionToken(real));
}

/**
 * True when this request may read and write data.
 * With no LOCKIN_PASSCODE there is no server side lock, so this is true.
 */
export async function isAuthed(): Promise<boolean> {
  const real = serverPasscode();
  if (!real) return true;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return !!token && safeEqual(token, sessionToken(real));
}

/** Use at the top of a route handler: `const no = await requireAuth(); if (no) return no;` */
export async function requireAuth(): Promise<Response | null> {
  if (await isAuthed()) return null;
  return Response.json({ error: "Locked. Enter the passcode." }, { status: 401 });
}

export async function startSession(): Promise<void> {
  const real = serverPasscode();
  if (!real) return;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionToken(real), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
