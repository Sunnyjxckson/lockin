// One sync round: read both calendars, ask the pure planner what to do, do
// the Google half, and hand the local half back to the caller. The Google
// client is passed in, so this runs against a fake in tests.

import { eventBody, eventFromGoogle, type GoogleEvent } from "@/lib/logic/calendar";
import { countPlan, linkOp, planSync, type LocalOp, type RemoteOp, type SyncDay, type SyncStats } from "@/lib/logic/calendarSync";
import { addDays, nyInstant } from "@/lib/logic/dates";
import type { DateStr, IsoStr } from "@/lib/types";

export interface CalendarApi {
  listEvents(calendarId: string, timeMin: IsoStr, timeMax: IsoStr): Promise<GoogleEvent[]>;
  insertEvent(calendarId: string, body: Record<string, unknown>): Promise<GoogleEvent>;
  patchEvent(calendarId: string, eventId: string, body: Record<string, unknown>): Promise<GoogleEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

/** An error from Google with its HTTP status. */
export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string | null = null,
  ) {
    super(message);
    this.name = "GoogleError";
  }
}

export interface RunSyncInput {
  /** The calendar events are read from. Null when none is chosen. */
  importCalendarId: string | null;
  importWritable: boolean;
  /** The calendar this app owns. */
  lockinCalendarId: string;
  days: SyncDay[];
  exportDates: DateStr[];
  edits?: Record<string, IsoStr>;
  /** Stop starting new writes after this long. What is left goes next round. */
  budgetMs?: number;
  concurrency?: number;
}

export interface RunSyncResult {
  localOps: LocalOp[];
  stats: SyncStats;
  /** True when some writes were left for the next round. */
  partial: boolean;
  errors: string[];
}

function gone(e: unknown): boolean {
  return e instanceof GoogleError && (e.status === 404 || e.status === 410);
}

export async function runSync(api: CalendarApi, input: RunSyncInput): Promise<RunSyncResult> {
  const dates = input.days.map((d) => d.date).sort();
  if (dates.length === 0) return { localOps: [], stats: { pulled: 0, pushed: 0, removed: 0 }, partial: false, errors: [] };
  const timeMin = nyInstant(dates[0], "00:00").toJSON();
  const timeMax = nyInstant(addDays(dates[dates.length - 1], 1), "00:00").toJSON();

  // Reads first. If either fails nothing is written anywhere, so a bad read
  // can never be mistaken for "everything was deleted".
  const sameCalendar = input.importCalendarId === input.lockinCalendarId;
  const [importedRaw, exportedRaw] = await Promise.all([
    input.importCalendarId && !sameCalendar ? api.listEvents(input.importCalendarId, timeMin, timeMax) : Promise.resolve([]),
    api.listEvents(input.lockinCalendarId, timeMin, timeMax),
  ]);

  const plan = planSync({
    days: input.days,
    imported: importedRaw.map((e) => eventFromGoogle(e, "import")),
    exported: exportedRaw.map((e) => eventFromGoogle(e, "lockin")),
    exportDates: input.exportDates,
    edits: input.edits,
    importWritable: input.importWritable,
  });

  const localOps: LocalOp[] = plan.local.slice();
  const errors: string[] = [];
  const deadline = Date.now() + (input.budgetMs ?? 20_000);
  let partial = false;
  const calendarOf = (op: RemoteOp) => (op.calendar === "lockin" ? input.lockinCalendarId : (input.importCalendarId as string));

  const run = async (op: RemoteOp): Promise<void> => {
    if (Date.now() > deadline) {
      partial = true;
      return;
    }
    try {
      if (op.op === "create") {
        const made = await api.insertEvent(calendarOf(op), eventBody(op.event, op.sig, op.blockId));
        localOps.push(linkOp(op.blockId, made.id));
      } else if (op.op === "update") {
        await api.patchEvent(calendarOf(op), op.eventId, eventBody(op.event, op.sig, op.blockId));
      } else {
        await api.deleteEvent(calendarOf(op), op.eventId);
      }
    } catch (e) {
      if (gone(e)) return;
      if (op.op === "update" && op.revert) {
        // Google would not take the change (a read only calendar), so the block goes back.
        localOps.push({ op: "update", id: op.revert.id, patch: op.revert.patch });
        return;
      }
      errors.push(e instanceof Error ? e.message : String(e));
    }
  };

  const queue = plan.remote.slice();
  const workers = Array.from({ length: Math.max(1, Math.min(input.concurrency ?? 5, queue.length)) }, async () => {
    for (let op = queue.shift(); op; op = queue.shift()) await run(op);
  });
  await Promise.all(workers);

  return { localOps, stats: countPlan(plan), partial, errors };
}
