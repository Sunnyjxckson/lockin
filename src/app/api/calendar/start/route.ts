// Step one of connecting: send the browser to Google's consent screen.

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";
import { googleConfig, originOf } from "@/features/calendar/server/config";
import { authUrl } from "@/features/calendar/server/google";
import { STATE_COOKIE } from "@/features/calendar/server/tokens";

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const origin = originOf(request);
  const config = googleConfig(origin);
  if (!config) return NextResponse.redirect(`${origin}/schedule?calendar=not_configured`);

  // A one time value that has to come back unchanged, so nobody else can
  // finish a sign in for this browser.
  const state = randomBytes(18).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  return NextResponse.redirect(authUrl(config, state));
}
