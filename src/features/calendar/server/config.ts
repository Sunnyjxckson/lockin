// Google credentials from the environment. Server only.

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar";
export const LOCKIN_CALENDAR_NAME = "Lock In";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : null;
}

/** Names of the variables that still need a value. */
export function missingGoogleEnv(): string[] {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"].filter((n) => !env(n));
}

/** GOOGLE_REDIRECT_URI, or this deployment's own callback when it is unset. */
export function redirectUriFor(origin: string): string {
  return env("GOOGLE_REDIRECT_URI") ?? `${origin.replace(/\/$/, "")}/api/calendar/callback`;
}

export function googleConfig(origin: string): GoogleConfig | null {
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: redirectUriFor(origin) };
}

/** The public origin of this request, honoring a proxy in front. */
export function originOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
