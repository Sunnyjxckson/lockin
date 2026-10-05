// Forget the Google sign in and tell Google to drop the grant.

import { requireAuth } from "@/lib/auth/server";
import { revoke } from "@/features/calendar/server/google";
import { clearState, loadState } from "@/features/calendar/server/tokens";

export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;

  const state = await loadState().catch(() => null);
  const token = state?.refreshToken ?? state?.accessToken;
  if (token) await revoke(token);
  await clearState();
  return Response.json({ ok: true });
}
