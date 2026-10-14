// The quote on the lock screen (PRD 28). Pure: the pinned quote rules and the
// layout math for the wallpaper (line breaking, stepping the type size down
// until the quote fits its box). The canvas drawing is in
// features/library/lockscreen, the server picture in api/lockscreen.

import type { PinnedQuote, WallpaperStyle } from "../types";
import type { Theme, Tokens } from "./theme";
import { rgba } from "./theme";

/** iPhone 15 Pro and up, in pixels. Any iPhone crops it to fit. */
export const WALLPAPER = { width: 1179, height: 2556 } as const;

export const MAX_QUOTE_CHARS = 600;
export const MAX_BY_CHARS = 80;

export const WALLPAPER_STYLES: readonly { id: WallpaperStyle; label: string }[] = [
  { id: "plain", label: "Plain" },
  { id: "lights", label: "Lights" },
  { id: "contrast", label: "High contrast" },
];

export function isWallpaperStyle(v: unknown): v is WallpaperStyle {
  return v === "plain" || v === "lights" || v === "contrast";
}

/** A style from a query string or a stored value. Anything else is the plain one. */
export function styleOf(v: unknown): WallpaperStyle {
  return isWallpaperStyle(v) ? v : "plain";
}

// ---------- the pinned quote ----------

function tidy(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** What the user typed or picked, made safe to pin. Null when there is nothing to pin. */
export function makePinned(input: { text: string; by?: string | null; quote_id?: string | null; wallpaper_style?: unknown }, at: string): PinnedQuote | null {
  const text = tidy(input.text).slice(0, MAX_QUOTE_CHARS).trim();
  if (!text) return null;
  const by = tidy(input.by ?? "").replace(/\n/g, " ").slice(0, MAX_BY_CHARS).trim();
  return { text, by, quote_id: input.quote_id?.trim() || null, pinned_at: at, wallpaper_style: styleOf(input.wallpaper_style) };
}

/** The value read back from the db, or null when it is missing or not shaped right. */
export function readPinned(v: unknown): PinnedQuote | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.text !== "string" || !o.text.trim()) return null;
  return {
    text: o.text,
    by: typeof o.by === "string" ? o.by : "",
    quote_id: typeof o.quote_id === "string" && o.quote_id ? o.quote_id : null,
    pinned_at: typeof o.pinned_at === "string" ? o.pinned_at : "",
    wallpaper_style: styleOf(o.wallpaper_style),
  };
}

/** True when this quote is the pinned one. A quote from the library matches by id, one you wrote by its words. */
export function isPinned(pinned: PinnedQuote | null, ref: { quote_id?: string | null; text?: string }): boolean {
  if (!pinned) return false;
  if (ref.quote_id) return pinned.quote_id === ref.quote_id;
  return !pinned.quote_id && !!ref.text && pinned.text === tidy(ref.text);
}

/** Make a secret for the wallpaper link from random bytes. 32 hex characters. */
export function tokenFrom(bytes: ArrayLike<number>): string {
  let out = "";
  for (let i = 0; i < bytes.length && out.length < 32; i++) out += (bytes[i] & 255).toString(16).padStart(2, "0");
  return out.slice(0, 32);
}

/** A token is 32 to 64 hex characters. Anything shorter is never accepted. */
export function isToken(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{32,64}$/.test(v);
}

/** Same length compare that gives nothing away early. The server also hashes both sides before it calls this. */
export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The link the Shortcuts automation opens. Relative to the app's origin. */
export function wallpaperPath(token: string, style: WallpaperStyle): string {
  return `/api/lockscreen/wallpaper.png?style=${style}&token=${token}`;
}

// ---------- layout ----------

/** Width of a string at a font size, in pixels. The canvas gives the real one, the server an estimate. */
export type Measure = (text: string, size: number) => number;

/** Average width of a character in Schibsted Grotesk Medium, as a share of the size, with room to spare. For places with no canvas. */
export const AVERAGE_CHAR = 0.56;

export const estimateWidth: Measure = (text, size) => text.length * size * AVERAGE_CHAR;

/**
 * Break text into lines no wider than `width`. A line break in the text stays
 * one. A word wider than the line is split by characters rather than left to
 * spill over.
 */
export function breakLines(text: string, measure: (s: string) => number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(" ").filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    const flush = () => {
      if (line) out.push(line);
      line = "";
    };
    for (const word of words) {
      const tryLine = line ? `${line} ${word}` : word;
      if (measure(tryLine) <= width) {
        line = tryLine;
        continue;
      }
      flush();
      if (measure(word) <= width) {
        line = word;
        continue;
      }
      // Too long on its own: cut it where it stops fitting.
      let chunk = "";
      for (const ch of Array.from(word)) {
        if (chunk && measure(chunk + ch) > width) {
          out.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    flush();
  }
  // No blank line at either end.
  while (out.length > 0 && out[0] === "") out.shift();
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

export interface Fit {
  size: number;
  lines: string[];
  lineHeight: number;
  /** Height of the block. */
  height: number;
  /** False only when even the smallest size does not fit. The smallest size is still returned. */
  fits: boolean;
}

export interface FitOptions {
  max: number;
  min: number;
  step: number;
  /** Line height as a multiple of the size. */
  leading: number;
}

/** The largest size from `max` down to `min` at which the text fits the box. */
export function fitText(text: string, measure: Measure, box: { width: number; height: number }, opts: FitOptions): Fit {
  let size = opts.max;
  let last: Fit | null = null;
  while (size >= opts.min) {
    const lines = breakLines(text, (s) => measure(s, size), box.width);
    const lineHeight = Math.round(size * opts.leading);
    const height = lines.length * lineHeight;
    last = { size, lines, lineHeight, height, fits: height <= box.height };
    if (last.fits) return last;
    size -= opts.step;
  }
  if (last) return last;
  const lines = breakLines(text, (s) => measure(s, opts.min), box.width);
  const lineHeight = Math.round(opts.min * opts.leading);
  return { size: opts.min, lines, lineHeight, height: lines.length * lineHeight, fits: lines.length * lineHeight <= box.height };
}

/**
 * Where the words go. The iOS clock sits in the top 30 percent and widgets
 * under it, the flashlight and camera in the bottom 10, so the quote lives in
 * the lower middle: between 47 and 82 percent of the height, left aligned.
 */
export const BOX = { x: 110, top: 1200, bottom: 2090 } as const;

export interface Layout {
  x: number;
  quote: Fit & { y: number };
  by: { text: string; size: number; y: number } | null;
  /** The outer edges of what is drawn, for tests. */
  top: number;
  bottom: number;
}

export function layoutWallpaper(pinned: Pick<PinnedQuote, "text" | "by">, measure: Measure): Layout {
  const width = WALLPAPER.width - BOX.x * 2;
  const boxHeight = BOX.bottom - BOX.top;
  const bySize = 40;
  const byGap = 56;
  const by = pinned.by.trim();
  const reserved = by ? byGap + Math.round(bySize * 1.3) : 0;
  const fit = fitText(pinned.text, measure, { width, height: boxHeight - reserved }, { max: 110, min: 40, step: 2, leading: 1.18 });
  const total = fit.height + reserved;
  // Centered in the box, so a short quote sits mid-lower screen and a long one fills it.
  const top = BOX.top + Math.max(0, Math.round((boxHeight - total) / 2));
  const byY = top + fit.height + byGap;
  return {
    x: BOX.x,
    quote: { ...fit, y: top },
    by: by ? { text: by, size: bySize, y: byY } : null,
    top,
    bottom: by ? byY + Math.round(bySize * 1.3) : top + fit.height,
  };
}

// ---------- looks ----------

/** Where the three lights sit, as shares of the width and height, and how far they reach as a share of the height. */
export const LIGHTS: readonly { x: number; y: number; r: number }[] = [
  { x: 0.1, y: 0.04, r: 0.55 },
  { x: 0.98, y: 0.5, r: 0.5 },
  { x: 0.2, y: 1, r: 0.55 },
];

export interface Look {
  background: string;
  ink: string;
  ink2: string;
  /** Three lights over the background, or none. */
  lights: { color: string; alpha: number; x: number; y: number; r: number }[];
}

/**
 * The colors for a style, all from the theme. Plain is the page color. Lights
 * adds the three lights the app draws behind every screen. High contrast is the
 * high contrast base, whatever the current look.
 */
export function lookFor(style: WallpaperStyle, theme: Pick<Theme, "tokens" | "fx">, contrast: Pick<Theme, "tokens">): Look {
  const t: Tokens = style === "contrast" ? contrast.tokens : theme.tokens;
  const lights =
    style === "lights"
      ? LIGHTS.map((l, i) => ({ ...l, color: t[`glow-${i + 1}` as "glow-1" | "glow-2" | "glow-3"], alpha: theme.fx.glow[i] }))
      : [];
  return { background: t.bg, ink: t.ink, ink2: t["ink-2"], lights };
}

/** CSS for the lights over the page color, for a place that cannot run a canvas. */
export function lightsCss(look: Look): string {
  if (look.lights.length === 0) return look.background;
  const layers = look.lights.map((l) => `radial-gradient(circle at ${Math.round(l.x * 100)}% ${Math.round(l.y * 100)}%, ${rgba(l.color, l.alpha)} 0%, ${rgba(l.color, 0)} ${Math.round(l.r * 100)}%)`);
  return `${layers.join(", ")}, ${look.background}`;
}

/** The file name for a saved wallpaper. */
export function wallpaperName(style: WallpaperStyle, date: string): string {
  return `lock-in-quote-${style}-${date}.png`;
}
