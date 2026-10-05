// One two way sync round. The browser sends the days it has (in local mode
// the server has no data of its own), this does the Google half and answers
// with the changes the browser should make to its blocks.

import { requireAuth } from "@/lib/auth/server";
import type { DayBlock } from "@/lib/blocks";
import type { SyncDay } from "@/lib/logic/calendarSync";
import { isDateStr, isTimeStr, nowIso } from "@/lib/logic/dates";
import type { DateStr, IsoStr } from "@/lib/types";
import { originOf } from "@/features/calendar/server/config";
import { ensureLockinCalendar } from "@/features/calendar/server/setup";
import { GoogleError, runSync, type RunSyncResult } from "@/features/calendar/server/sync";
import { openSession, saveState } from "@/features/calendar/server/tokens";

const MAX_DAYS = 120;
const MAX_BLOCKS = 80;

function readBlock(v: unknown, date: DateStr): DayBlock | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  if (typeof b.id !== "string" || typeof b.block_name !== "string") return null;
  if (!isTimeStr(b.start) || !isTimeStr(b.end) || typeof b.duration !== "number" || !Number.isFinite(b.duration)) return null;
  const source = b.source === "template" || b.source === "calendar" ? b.source : "manual";
  return {
    id: b.id,
    date,
    block_name: b.block_name.slice(0, 200),
    start: b.start,
    end: b.end,
    duration: Math.max(1, Math.round(b.duration)),
    flexible: b.flexible !== false,
    kind: (typeof b.kind === "string" ? b.kind : "other") as DayBlock["kind"],
    note: typeof b.note === "string" ? b.note.slice(0, 1000) : null,
    calendar_event_id: typeof b.calendar_event_id === "string" ? b.calendar_event_id : null,
    template_id: typeof b.template_id === "string" ? b.template_id : null,
    source,
    persisted: b.persisted === true,
  };
}

function readDays(v: unknown): SyncDay[] | null {
  if (!Array.isArray(v) || v.length > MAX_DAYS) return null;
  const out: SyncDay[] = [];
  const seen = new Set<string>();
  for (const d of v) {
    const day = d as { date?: unknown; blocks?: unknown };
    if (!isDateStr(day?.date) || seen.has(day.date) || !Array.isArray(day.blocks) || day.blocks.length > MAX_BLOCKS) return null;
    seen.add(day.date);
    const date = day.date;
    const blocks = day.blocks.map((b) => readBlock(b, date));
    if (blocks.some((b) => b === null)) return null;
    out.push({ date, blocks: blocks as DayBlock[] });
  }
  return out;
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { days?: unknown; exportDates?: unknown; edits?: unknown } | null;
  const days = readDays(body?.days);
  if (!days) return Response.json({ error: "Send the days to sync." }, { status: 400 });
  const exportDates = Array.isArray(body?.exportDates) ? body.exportDates.filter(isDateStr) : [];
  const edits: Record<string, IsoStr> = {};
  if (body?.edits && typeof body.edits === "object") {
    for (const [id, at] of Object.entries(body.edits as Record<string, unknown>)) {
      if (typeof at === "string" && !Number.isNaN(Date.parse(at))) edits[id] = at;
    }
  }

  try {
    const session = await openSession(originOf(request));
    if (!session) return Response.json({ error: "not_connected" }, { status: 409 });
    let state = await ensureLockinCalendar(session.client, session.state);

    const round = (): Promise<RunSyncResult> =>
      runSync(session.client, {
        importCalendarId: state.calendarId,
        importWritable: state.extra.importWritable !== false,
        lockinCalendarId: state.extra.lockinCalendarId as string,
        days,
        exportDates,
        edits,
      });

    let result: RunSyncResult;
    try {
      result = await round();
    } catch (e) {
      // The Lock In calendar was deleted in Google: make it again and retry once.
      if (!(e instanceof GoogleError) || (e.status !== 404 && e.status !== 410)) throw e;
      state = await ensureLockinCalendar(session.client, state, true);
      result = await round();
    }

    const lastSyncAt = nowIso();
    await saveState({ ...state, extra: { ...state.extra, lastSyncAt } });
    return Response.json({ ok: true, ...result, lastSyncAt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    return Response.json({ error: message }, { status: e instanceof GoogleError ? 502 : 500 });
  }
}
