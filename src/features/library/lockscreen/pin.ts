"use client";

// The pinned quote: read it, pin one, take it off, change its look, make the
// secret for the wallpaper link. Everything goes through app_settings. This
// file is light on purpose: Today and the coach import it, so it loads no
// quote data (pinLibraryQuote loads the one quote file it needs, when called).

import { useMemo } from "react";
import { useSettings } from "@/lib/db/hooks";
import { getSettings, updateSettings } from "@/lib/db/helpers";
import { nowIso } from "@/lib/logic/dates";
import { isToken, makePinned, readPinned, tokenFrom } from "@/lib/logic/lockscreen";
import type { PinnedQuote, WallpaperStyle } from "@/lib/types";

export interface PinnedState {
  pinned: PinnedQuote | null;
  token: string | null;
  loading: boolean;
}

/** The pinned quote and the link secret, live. */
export function usePinned(): PinnedState {
  const settings = useSettings();
  const pq = settings.data?.pinned_quote;
  const tk = settings.data?.lockscreen_token;
  const loading = settings.loading;
  return useMemo(() => ({ pinned: readPinned(pq), token: isToken(tk) ? tk : null, loading }), [pq, tk, loading]);
}

/**
 * "empty" is nothing to pin. "setup" is the 0019 migration not run yet: the
 * database refused the column, so it was left out and nothing was kept.
 */
export type PinResult = { ok: true; pinned: PinnedQuote } | { ok: false; reason: "empty" | "setup" | "failed" };

async function write(patch: { pinned_quote?: PinnedQuote | null; lockscreen_token?: string | null }): Promise<boolean> {
  const saved = await updateSettings(patch);
  return Object.keys(patch).every((k) => k in saved);
}

/** Put a quote on the lock screen. The look stays as it was. */
export async function pinQuote(input: { text: string; by?: string | null; quote_id?: string | null }): Promise<PinResult> {
  try {
    const was = readPinned((await getSettings())?.pinned_quote);
    const pinned = makePinned({ ...input, wallpaper_style: was?.wallpaper_style }, nowIso());
    if (!pinned) return { ok: false, reason: "empty" };
    return (await write({ pinned_quote: pinned })) ? { ok: true, pinned } : { ok: false, reason: "setup" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Pin a quote from the library by its id. Loads that writer's file, and nothing else. */
export async function pinLibraryQuote(id: string, writer?: string | null): Promise<PinResult> {
  try {
    const [{ findQuote, indexWriter }, { citeQuote, isLaw }] = await Promise.all([import("../data"), import("@/lib/logic/library")]);
    const q = await findQuote(id, writer);
    if (!q) return { ok: false, reason: "failed" };
    const name = isLaw(q) ? citeQuote(q, "").title : (indexWriter(q.writer)?.name ?? "");
    return pinQuote({ text: q.text, by: name, quote_id: q.id });
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export async function unpinQuote(): Promise<void> {
  await updateSettings({ pinned_quote: null });
}

export async function setPinnedStyle(style: WallpaperStyle): Promise<void> {
  const was = readPinned((await getSettings())?.pinned_quote);
  if (!was || was.wallpaper_style === style) return;
  await updateSettings({ pinned_quote: { ...was, wallpaper_style: style } });
}

/** Make a new secret for the wallpaper link, which stops the old link working. Null when it could not be kept. */
export async function makeLockscreenToken(): Promise<string | null> {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const token = tokenFrom(bytes);
  try {
    return (await write({ lockscreen_token: token })) ? token : null;
  } catch {
    return null;
  }
}

/** What to tell the user when pinning did not work. */
export function pinProblem(reason: "empty" | "setup" | "failed"): string {
  if (reason === "setup") return "Could not keep it. Run supabase/migrations/0019_pinned_quote.sql first.";
  if (reason === "empty") return "Write a line first.";
  return "Could not put it on your lock screen. Try again.";
}
