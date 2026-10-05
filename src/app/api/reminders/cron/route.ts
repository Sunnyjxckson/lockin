// The scheduled reminder job. Called every few minutes by a scheduler
// (vercel.json, or any external pinger), never by the browser, so it is
// guarded by CRON_SECRET instead of the passcode cookie.
//
//   GET /api/reminders/cron
//   Authorization: Bearer <CRON_SECRET>
//
// Vercel Cron sends that header on its own when CRON_SECRET is set in the
// project. A pinger that cannot set headers may use ?secret=<CRON_SECRET>.

import { createHash, timingSafeEqual } from "node:crypto";
import { isSupabaseMode } from "@/lib/db";
import { runCron } from "@/features/reminders/server/cron";
import { makeSender, vapidConfig } from "@/features/reminders/server/push";
import { supabaseCronStore } from "@/features/reminders/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function same(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

function allowed(request: Request): Response | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ error: "CRON_SECRET is not set, so the reminder job is off." }, { status: 503 });
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const query = new URL(request.url).searchParams.get("secret") ?? "";
  const given = bearer || request.headers.get("x-cron-secret") || query;
  if (!given || !same(given, secret)) return Response.json({ error: "Wrong or missing cron secret." }, { status: 401 });
  return null;
}

async function handle(request: Request): Promise<Response> {
  const denied = allowed(request);
  if (denied) return denied;

  if (!isSupabaseMode() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      { error: "Scheduled reminders need Supabase. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }
  const { config, missing } = vapidConfig();
  if (!config) return Response.json({ error: `Web push is not set up. Missing: ${missing.join(", ")}.` }, { status: 503 });

  try {
    const result = await runCron({ ...supabaseCronStore(), now: new Date(), send: makeSender(config) });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "The reminder job failed." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
