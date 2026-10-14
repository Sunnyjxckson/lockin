// The wallpaper at a link: today's pinned quote as a 1179 x 2556 PNG, for an
// iOS Shortcuts automation to open each morning (PRD 28).
//
//   GET /api/lockscreen/wallpaper.png?style=plain|lights|contrast&token=<secret>
//
// Only in Supabase mode, where the server can read app_settings. Guarded by
// the secret the lock screen screen makes (app_settings.lockscreen_token),
// never the passcode: a Shortcut cannot carry the cookie. Without the token
// the answer is the same 401 whether the token is missing, wrong or never made.

import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { db, isSupabaseMode } from "@/lib/db";
import { WALLPAPER, estimateWidth, isToken, layoutWallpaper, lightLayers, lookFor, readPinned, styleOf } from "@/lib/logic/lockscreen";
import { buildTheme } from "@/lib/logic/theme";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function same(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

const headers = { "Cache-Control": "no-store" };

async function font(): Promise<ArrayBuffer | null> {
  try {
    const buf = await readFile(join(process.cwd(), "src/app/fonts/SchibstedGrotesk-Medium-latin.ttf"));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!isSupabaseMode() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "The wallpaper link needs sync. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." }, { status: 503, headers });
  }
  const url = new URL(request.url);
  const given = url.searchParams.get("token") ?? "";
  const settings = await db.get("app_settings", "app");
  const stored = settings?.lockscreen_token;
  if (!isToken(given) || !isToken(stored) || !same(given, stored)) {
    return Response.json({ error: "Wrong or missing token." }, { status: 401, headers });
  }
  const pinned = readPinned(settings?.pinned_quote);
  if (!pinned) return Response.json({ error: "No quote is pinned." }, { status: 404, headers });

  const style = url.searchParams.has("style") ? styleOf(url.searchParams.get("style")) : pinned.wallpaper_style;
  const row = await db.first("theme", { eq: { active: true } });
  const theme = buildTheme(row?.base ?? "dark", row?.palette ?? null);
  const look = lookFor(style, theme, buildTheme("contrast", null));
  // No canvas here, so the lines are broken on an estimate that errs wide.
  const layout = layoutWallpaper(pinned, estimateWidth);
  const data = await font();
  const lights = lightLayers(look);

  return new ImageResponse(
    (
      <div style={{ width: WALLPAPER.width, height: WALLPAPER.height, display: "flex", position: "relative", backgroundColor: look.background, ...(lights ? { backgroundImage: lights } : {}), ...(data ? { fontFamily: "Schibsted Grotesk" } : {}) }}>
        {layout.quote.lines.map((line, i) => (
          <div key={i} style={{ position: "absolute", left: layout.x, top: layout.quote.y + i * layout.quote.lineHeight, fontSize: layout.quote.size, lineHeight: `${layout.quote.lineHeight}px`, color: look.ink, whiteSpace: "pre", display: "flex" }}>
            {line || " "}
          </div>
        ))}
        {layout.by ? (
          <div style={{ position: "absolute", left: layout.x, top: layout.by.y, fontSize: layout.by.size, color: look.ink2, whiteSpace: "pre", display: "flex" }}>{layout.by.text}</div>
        ) : null}
      </div>
    ),
    {
      width: WALLPAPER.width,
      height: WALLPAPER.height,
      headers,
      fonts: data ? [{ name: "Schibsted Grotesk", data, weight: 500, style: "normal" }] : undefined,
    },
  );
}
