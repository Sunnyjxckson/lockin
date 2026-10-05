// Store or drop this device's push subscription. In local mode the server
// has nowhere to keep it, so it answers stored: false and the device keeps
// its own copy for the test button.

import { requireAuth } from "@/lib/auth/server";
import { db, isSupabaseMode } from "@/lib/db";
import { parseSubscription } from "@/features/reminders/server/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { subscription?: unknown; user_agent?: unknown } | null;
  const target = parseSubscription(body?.subscription);
  if (!target) return Response.json({ error: "That is not a push subscription." }, { status: 400 });

  if (!isSupabaseMode()) return Response.json({ stored: false });
  try {
    const user_agent = typeof body?.user_agent === "string" ? body.user_agent.slice(0, 300) : null;
    await db.upsert("push_subscription", { ...target, user_agent }, ["endpoint"]);
    return Response.json({ stored: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not save the subscription." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string" || !body.endpoint) return Response.json({ error: "No endpoint given." }, { status: 400 });
  if (!isSupabaseMode()) return Response.json({ removed: 0 });
  try {
    const removed = await db.removeWhere("push_subscription", { endpoint: body.endpoint });
    return Response.json({ removed });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not remove the subscription." }, { status: 500 });
  }
}
