// Where the Google sign in is kept. Server only.
//
// Supabase mode: the foundation's calendar_token table, one row for
// provider "google". The browser cannot read that table.
//
// Local mode has no server database, so the refresh token is kept in an
// httpOnly cookie instead, encrypted with a key made from the Google client
// secret. Page scripts cannot read it, it only ever travels to this app's
// own server, and it is useless without the secret. The short lived access
// token is not stored at all in that mode: it is fetched again when needed
// and held in memory.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { supabaseConfigured } from "@/lib/db/supabase";
import type { IsoStr } from "@/lib/types";
import { googleConfig, type GoogleConfig } from "./config";
import { googleClient, refreshAccess, type GoogleClient } from "./google";
import { GoogleError } from "./sync";

export const TOKEN_COOKIE = "lockin_gcal";
export const STATE_COOKIE = "lockin_gcal_state";
const COOKIE_DAYS = 180;

/** What sync remembers between runs, beside the tokens. */
export interface CalendarExtra {
  /** The calendar this app made for its own blocks. */
  lockinCalendarId?: string;
  /** Name and write access of the chosen calendar, for the UI and the planner. */
  importName?: string;
  importWritable?: boolean;
  lastSyncAt?: IsoStr;
}

export interface CalendarState {
  refreshToken: string | null;
  accessToken: string | null;
  expiresAt: IsoStr | null;
  /** The calendar events are read from. */
  calendarId: string | null;
  extra: CalendarExtra;
}

export type TokenStorage = "database" | "cookie";

export function tokenStorage(): TokenStorage {
  return supabaseConfigured() ? "database" : "cookie";
}

// ---------- cookie sealing ----------

function key(): Buffer {
  return createHash("sha256")
    .update(`lockin-gcal-v1:${process.env.GOOGLE_CLIENT_SECRET ?? ""}:${process.env.LOCKIN_PASSCODE ?? ""}`)
    .digest();
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal<T>(sealed: string): T | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

interface CookiePayload {
  r: string | null;
  c: string | null;
  x: CalendarExtra;
}

// Access tokens for cookie mode, by refresh token. Lost on restart, which
// only costs one refresh call.
const memory = new Map<string, { token: string; expiresAt: IsoStr }>();

function parseExtra(text: string | null): CalendarExtra {
  if (!text) return {};
  try {
    const v = JSON.parse(text) as CalendarExtra;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

// ---------- load, save, clear ----------

export async function loadState(): Promise<CalendarState | null> {
  if (tokenStorage() === "database") {
    const row = await db.first("calendar_token", { eq: { provider: "google" } });
    if (!row) return null;
    return {
      refreshToken: row.refresh_token,
      accessToken: row.access_token || null,
      expiresAt: row.expires_at,
      calendarId: row.calendar_id,
      // The sync_token column holds this app's own sync notes as JSON.
      extra: parseExtra(row.sync_token),
    };
  }
  const jar = await cookies();
  const sealed = jar.get(TOKEN_COOKIE)?.value;
  const payload = sealed ? unseal<CookiePayload>(sealed) : null;
  if (!payload || !payload.r) return null;
  const cached = memory.get(payload.r);
  return {
    refreshToken: payload.r,
    accessToken: cached?.token ?? null,
    expiresAt: cached?.expiresAt ?? null,
    calendarId: payload.c,
    extra: payload.x ?? {},
  };
}

export async function saveState(state: CalendarState): Promise<void> {
  if (tokenStorage() === "database") {
    await db.upsert(
      "calendar_token",
      {
        provider: "google",
        access_token: state.accessToken ?? "",
        refresh_token: state.refreshToken,
        expires_at: state.expiresAt,
        calendar_id: state.calendarId,
        sync_token: JSON.stringify(state.extra),
      },
      ["provider"],
    );
    return;
  }
  if (state.refreshToken && state.accessToken && state.expiresAt) {
    memory.set(state.refreshToken, { token: state.accessToken, expiresAt: state.expiresAt });
  }
  const jar = await cookies();
  const payload: CookiePayload = { r: state.refreshToken, c: state.calendarId, x: state.extra };
  jar.set(TOKEN_COOKIE, seal(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_DAYS * 24 * 60 * 60,
  });
}

export async function clearState(): Promise<void> {
  if (tokenStorage() === "database") {
    await db.removeWhere("calendar_token", { provider: "google" });
    return;
  }
  const jar = await cookies();
  const sealed = jar.get(TOKEN_COOKIE)?.value;
  const payload = sealed ? unseal<CookiePayload>(sealed) : null;
  if (payload?.r) memory.delete(payload.r);
  jar.delete(TOKEN_COOKIE);
}

// ---------- a ready client ----------

export interface Session {
  state: CalendarState;
  client: GoogleClient;
  config: GoogleConfig;
}

/** True when the access token is good for at least another minute. */
export function isFresh(expiresAt: IsoStr | null, now: number = Date.now()): boolean {
  return !!expiresAt && Date.parse(expiresAt) - now > 60_000;
}

/**
 * The stored sign in with a working access token, refreshed when it has
 * run out. Null when not connected. If Google says the grant is gone (the
 * user removed access), the stored sign in is cleared and this is null too.
 */
export async function openSession(origin: string): Promise<Session | null> {
  const config = googleConfig(origin);
  if (!config) return null;
  const state = await loadState();
  if (!state) return null;
  if (state.accessToken && isFresh(state.expiresAt)) return { state, client: googleClient(state.accessToken), config };
  if (!state.refreshToken) return null;
  try {
    const grant = await refreshAccess(config, state.refreshToken);
    const next: CalendarState = {
      ...state,
      accessToken: grant.access_token,
      expiresAt: new Date(Date.now() + grant.expires_in * 1000).toJSON(),
      refreshToken: grant.refresh_token ?? state.refreshToken,
    };
    await saveState(next);
    return { state: next, client: googleClient(grant.access_token), config };
  } catch (e) {
    if (e instanceof GoogleError && (e.reason === "invalid_grant" || e.status === 400 || e.status === 401)) {
      await clearState();
      return null;
    }
    throw e;
  }
}
