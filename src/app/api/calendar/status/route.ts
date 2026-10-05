// Is Google Calendar set up, and is it connected?

import { requireAuth } from "@/lib/auth/server";
import { missingGoogleEnv, originOf, redirectUriFor } from "@/features/calendar/server/config";
import { loadState, tokenStorage } from "@/features/calendar/server/tokens";

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const missing = missingGoogleEnv();
  const base = { storage: tokenStorage(), redirectUri: redirectUriFor(originOf(request)) };
  if (missing.length > 0) {
    return Response.json({ ...base, configured: false, missing, connected: false });
  }
  const state = await loadState().catch(() => null);
  return Response.json({
    ...base,
    configured: true,
    missing: [],
    connected: !!state,
    calendarId: state?.calendarId ?? null,
    calendarName: state?.extra.importName ?? null,
    importWritable: state?.extra.importWritable ?? null,
    lastSyncAt: state?.extra.lastSyncAt ?? null,
  });
}
