import { describeWait, tryLogin } from "@/lib/auth/limiter";
import { passcodeMatches, serverPasscode, startSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!serverPasscode()) return Response.json({ error: "No server passcode is set." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { passcode?: unknown } | null;
  const attempt = typeof body?.passcode === "string" ? body.passcode : "";
  // Repeated guesses are slowed down. See src/lib/auth/limiter.ts for where the count is kept.
  const out = await tryLogin(() => passcodeMatches(attempt));
  if (!out.ok) {
    if (out.locked) return Response.json({ error: `Too many tries. Wait ${describeWait(out.waitMs)}.` }, { status: 429 });
    return Response.json({ error: "Wrong passcode." }, { status: 401 });
  }
  await startSession();
  return Response.json({ ok: true });
}
