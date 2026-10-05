import { isAuthed, serverPasscode } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// mode "server": LOCKIN_PASSCODE is set and the cookie decides.
// mode "local": no server passcode, the device keeps its own.
// problem: Supabase is switched on but the server cannot use it safely yet.
export async function GET() {
  const mode = serverPasscode() ? "server" : "local";
  let problem: string | null = null;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      problem = "NEXT_PUBLIC_SUPABASE_URL is set but SUPABASE_SERVICE_ROLE_KEY is not. Add it on the server, or remove the URL to keep data on this device.";
    } else if (mode === "local") {
      problem = "Supabase is on, so the server needs a passcode. Set LOCKIN_PASSCODE and restart.";
    }
  }
  return Response.json({ mode, authed: mode === "server" ? await isAuthed() : false, problem });
}
