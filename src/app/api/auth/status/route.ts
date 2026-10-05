import { isAuthed, serverPasscode } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// mode "server": LOCKIN_PASSCODE is set and the cookie decides.
// mode "local": no server passcode, the device keeps its own.
export async function GET() {
  const mode = serverPasscode() ? "server" : "local";
  return Response.json({ mode, authed: mode === "server" ? await isAuthed() : false });
}
