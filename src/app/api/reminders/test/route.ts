// Send one test push to the subscription in the request body. The device
// sends its own subscription, so this works in local mode too as long as the
// VAPID keys are set.

import { requireAuth } from "@/lib/auth/server";
import { db, isSupabaseMode } from "@/lib/db";
import { makeSender, parseSubscription, vapidConfig } from "@/features/reminders/server/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { config, missing } = vapidConfig();
  if (!config) {
    return Response.json({ ok: false, error: `Web push is not set up. Missing: ${missing.join(", ")}.`, missing }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { subscription?: unknown } | null;
  const target = parseSubscription(body?.subscription);
  if (!target) return Response.json({ ok: false, error: "That is not a push subscription." }, { status: 400 });

  const out = await makeSender(config, { ttl: 60 })(target, {
    title: "Lock In",
    body: "Test reminder. Push is working on this device.",
    url: "/reminders",
    tag: "lockin-test",
  });

  if (out.gone && isSupabaseMode()) {
    await db.removeWhere("push_subscription", { endpoint: target.endpoint }).catch(() => 0);
  }
  if (!out.ok) {
    const error = out.gone
      ? "This device's subscription has expired. Turn notifications on again."
      : `The push service refused it${out.status ? ` (${out.status})` : ""}. ${out.error ?? ""}`.trim();
    return Response.json({ ok: false, gone: out.gone, status: out.status, error }, { status: 502 });
  }
  return Response.json({ ok: true, status: out.status });
}
