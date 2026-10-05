import { endSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function POST() {
  await endSession();
  return Response.json({ ok: true });
}
