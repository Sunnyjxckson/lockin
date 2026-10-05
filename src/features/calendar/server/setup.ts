// Finding the calendars a session works with. Server only.

import { TIME_ZONE } from "@/lib/logic/dates";
import { LOCKIN_CALENDAR_NAME } from "./config";
import type { CalendarEntry, GoogleClient } from "./google";
import type { CalendarState } from "./tokens";

export function canWrite(c: Pick<CalendarEntry, "accessRole">): boolean {
  return c.accessRole === "owner" || c.accessRole === "writer";
}

/** The calendar this app owns, among the user's calendars. */
export function findLockinCalendar(list: readonly CalendarEntry[]): CalendarEntry | null {
  return list.find((c) => c.summary === LOCKIN_CALENDAR_NAME && c.accessRole === "owner" && !c.primary) ?? null;
}

/** Calendars that make sense to read events from. */
export function importChoices(list: readonly CalendarEntry[], lockinId: string | null): CalendarEntry[] {
  return list
    .filter((c) => c.id !== lockinId && c.accessRole !== "freeBusyReader" && !(c.summary === LOCKIN_CALENDAR_NAME && !c.primary))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.summary.localeCompare(b.summary));
}

/**
 * Make sure the "Lock In" calendar exists and the state knows it. Reuses one
 * with that name before making another, so reconnecting never leaves two.
 */
export async function ensureLockinCalendar(client: GoogleClient, state: CalendarState, force = false): Promise<CalendarState> {
  if (state.extra.lockinCalendarId && !force) return state;
  const list = await client.listCalendars();
  const found = findLockinCalendar(list);
  const lockin = found ?? (await client.createCalendar(LOCKIN_CALENDAR_NAME, TIME_ZONE));
  return { ...state, extra: { ...state.extra, lockinCalendarId: lockin.id } };
}
