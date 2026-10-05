import { passcodeMatches, serverPasscode, startSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// Slow repeated guesses down. Per server instance, which is enough for one user.
let failures = 0;
let lockedUntil = 0;

export async function POST(request: Request) {
  if (!serverPasscode()) return Response.json({ error: "No server passcode is set." }, { status: 400 });
  if (Date.now() < lockedUntil) {
    return Response.json({ error: "Too many tries. Wait a minute." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { passcode?: unknown } | null;
  const attempt = typeof body?.passcode === "string" ? body.passcode : "";
  if (!passcodeMatches(attempt)) {
    failures += 1;
    if (failures >= 5) {
      failures = 0;
      lockedUntil = Date.now() + 60_000;
    }
    return Response.json({ error: "Wrong passcode." }, { status: 401 });
  }
  failures = 0;
  await startSession();
  return Response.json({ ok: true });
}
