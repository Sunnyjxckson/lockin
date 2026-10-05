// What the Reminders screen needs to know about the server: which keys are
// set, and in Supabase mode how many devices are subscribed and when the job
// last ran. Never returns a secret, only whether it is set.

import { requireAuth } from "@/lib/auth/server";
import { isSupabaseMode } from "@/lib/db";
import { vapidConfig } from "@/features/reminders/server/push";
import { getLastRun, listSubscriptions } from "@/features/reminders/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const { config, missing } = vapidConfig();
  const supabase = isSupabaseMode() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = !!process.env.CRON_SECRET?.trim();

  let subscriptions: number | null = null;
  let lastRun: string | null = null;
  let problem: string | null = null;
  if (supabase) {
    try {
      subscriptions = (await listSubscriptions()).length;
      lastRun = (await getLastRun())?.toISOString() ?? null;
    } catch (e) {
      problem = e instanceof Error ? e.message : "Could not read the reminder tables.";
    }
  }

  return Response.json({
    vapid: !!config,
    missing,
    supabase,
    cron_secret: cronSecret,
    subscriptions,
    last_run: lastRun,
    problem,
  });
}
