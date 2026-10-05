// A thin Google Calendar client over fetch. No SDK. Every decision about
// what to sync lives in src/lib/logic/calendarSync.ts, not here.

import type { GoogleEvent } from "@/lib/logic/calendar";
import type { IsoStr } from "@/lib/types";
import { GOOGLE_SCOPE, type GoogleConfig } from "./config";
import { GoogleError, type CalendarApi } from "./sync";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

export function authUrl(config: GoogleConfig, state: string): string {
  const q = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    // Always ask, so Google hands back a refresh token every time.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

export interface TokenGrant {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenGrant> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Partial<TokenGrant> & { error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new GoogleError(data.error_description ?? data.error ?? `Google sign in failed (${res.status})`, res.status, data.error ?? null);
  }
  return { access_token: data.access_token, expires_in: data.expires_in ?? 3600, refresh_token: data.refresh_token };
}

export function exchangeCode(config: GoogleConfig, code: string): Promise<TokenGrant> {
  return tokenRequest({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
}

export function refreshAccess(config: GoogleConfig, refreshToken: string): Promise<TokenGrant> {
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });
}

export async function revoke(token: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    cache: "no-store",
  }).catch(() => undefined);
}

export interface CalendarEntry {
  id: string;
  summary: string;
  primary: boolean;
  /** owner, writer, reader or freeBusyReader. */
  accessRole: string;
}

export interface GoogleClient extends CalendarApi {
  listCalendars(): Promise<CalendarEntry[]>;
  createCalendar(summary: string, timeZone: string): Promise<CalendarEntry>;
}

export function googleClient(accessToken: string): GoogleClient {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
    if (!res.ok) {
      throw new GoogleError(data.error?.message ?? `Google Calendar answered ${res.status}`, res.status, data.error?.errors?.[0]?.reason ?? null);
    }
    return data as T;
  }

  const cal = (id: string) => `/calendars/${encodeURIComponent(id)}`;

  return {
    async listCalendars() {
      const out: CalendarEntry[] = [];
      let pageToken: string | undefined;
      do {
        const q = new URLSearchParams({ maxResults: "250" });
        if (pageToken) q.set("pageToken", pageToken);
        const page = await call<{
          items?: { id: string; summary?: string; summaryOverride?: string; primary?: boolean; accessRole?: string }[];
          nextPageToken?: string;
        }>(`/users/me/calendarList?${q}`);
        for (const c of page.items ?? []) {
          out.push({ id: c.id, summary: c.summaryOverride ?? c.summary ?? c.id, primary: !!c.primary, accessRole: c.accessRole ?? "reader" });
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      return out;
    },

    async createCalendar(summary, timeZone) {
      const made = await call<{ id: string; summary?: string }>("/calendars", { method: "POST", body: JSON.stringify({ summary, timeZone }) });
      return { id: made.id, summary: made.summary ?? summary, primary: false, accessRole: "owner" };
    },

    async listEvents(calendarId: string, timeMin: IsoStr, timeMax: IsoStr) {
      const out: GoogleEvent[] = [];
      let pageToken: string | undefined;
      do {
        // singleEvents turns a repeating class into one event per meeting.
        // showDeleted is how a delete in Google is told apart from "never made".
        const q = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "2500", timeMin, timeMax });
        if (pageToken) q.set("pageToken", pageToken);
        const page = await call<{ items?: GoogleEvent[]; nextPageToken?: string }>(`${cal(calendarId)}/events?${q}`);
        out.push(...(page.items ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return out;
    },

    insertEvent(calendarId, body) {
      return call<GoogleEvent>(`${cal(calendarId)}/events`, { method: "POST", body: JSON.stringify(body) });
    },

    patchEvent(calendarId, eventId, body) {
      return call<GoogleEvent>(`${cal(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "PATCH", body: JSON.stringify(body) });
    },

    async deleteEvent(calendarId, eventId) {
      await call<void>(`${cal(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
    },
  };
}
