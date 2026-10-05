// The user's calendars, and which one class times are read from.

import { requireAuth } from "@/lib/auth/server";
import { originOf } from "@/features/calendar/server/config";
import { canWrite, importChoices } from "@/features/calendar/server/setup";
import { GoogleError } from "@/features/calendar/server/sync";
import { openSession, saveState } from "@/features/calendar/server/tokens";

function fail(e: unknown): Response {
  const status = e instanceof GoogleError && e.status >= 400 && e.status < 600 ? 502 : 500;
  return Response.json({ error: e instanceof Error ? e.message : "Google Calendar could not be reached." }, { status });
}

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    const session = await openSession(originOf(request));
    if (!session) return Response.json({ error: "not_connected" }, { status: 409 });
    const list = await session.client.listCalendars();
    const choices = importChoices(list, session.state.extra.lockinCalendarId ?? null);
    return Response.json({
      calendarId: session.state.calendarId,
      calendars: choices.map((c) => ({ id: c.id, name: c.summary, primary: c.primary, writable: canWrite(c) })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => ({}))) as { calendarId?: unknown };
    const wanted = typeof body.calendarId === "string" && body.calendarId.length > 0 ? body.calendarId : null;
    const session = await openSession(originOf(request));
    if (!session) return Response.json({ error: "not_connected" }, { status: 409 });
    let name: string | undefined;
    let writable: boolean | undefined;
    if (wanted) {
      const list = await session.client.listCalendars();
      const pick = importChoices(list, session.state.extra.lockinCalendarId ?? null).find((c) => c.id === wanted);
      if (!pick) return Response.json({ error: "That calendar is not on this account." }, { status: 400 });
      name = pick.summary;
      writable = canWrite(pick);
    }
    await saveState({
      ...session.state,
      calendarId: wanted,
      extra: { ...session.state.extra, importName: name, importWritable: writable },
    });
    return Response.json({ ok: true, calendarId: wanted, calendarName: name ?? null, importWritable: writable ?? null });
  } catch (e) {
    return fail(e);
  }
}
