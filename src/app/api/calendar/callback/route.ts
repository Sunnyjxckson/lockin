// Step two of connecting: Google sends the browser back here with a code,
// which is traded for tokens and stored on the server side.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";
import { googleConfig, originOf } from "@/features/calendar/server/config";
import { exchangeCode, googleClient } from "@/features/calendar/server/google";
import { canWrite, findLockinCalendar } from "@/features/calendar/server/setup";
import { loadState, saveState, STATE_COOKIE, type CalendarState } from "@/features/calendar/server/tokens";

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const origin = originOf(request);
  const back = (result: string) => NextResponse.redirect(`${origin}/schedule?calendar=${result}`);
  const config = googleConfig(origin);
  if (!config) return back("not_configured");

  const url = new URL(request.url);
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !expected || state !== expected) return back("failed");

  try {
    const grant = await exchangeCode(config, code);
    const previous = await loadState().catch(() => null);
    let next: CalendarState = {
      refreshToken: grant.refresh_token ?? previous?.refreshToken ?? null,
      accessToken: grant.access_token,
      expiresAt: new Date(Date.now() + grant.expires_in * 1000).toJSON(),
      calendarId: null,
      extra: {},
    };
    if (!next.refreshToken) return back("failed");
    // Start on the main calendar. It can be changed on the Schedule screen.
    try {
      const list = await googleClient(grant.access_token).listCalendars();
      const main = list.find((c) => c.primary) ?? null;
      const lockin = findLockinCalendar(list);
      next = {
        ...next,
        calendarId: main?.id ?? null,
        extra: {
          importName: main?.summary,
          importWritable: main ? canWrite(main) : undefined,
          lockinCalendarId: lockin?.id,
        },
      };
    } catch {
      // The list can be read later. Being connected matters more.
    }
    await saveState(next);
    return back("connected");
  } catch {
    return back("failed");
  }
}
