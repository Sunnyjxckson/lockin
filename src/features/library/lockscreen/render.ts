"use client";

// Drawing the lock screen wallpaper on a canvas, and getting the picture to
// the phone. The layout math is in logic/lockscreen. Colors are the theme's
// tokens, handed in by the caller, so nothing is hard coded here.

import { WALLPAPER, layoutWallpaper, type Look } from "@/lib/logic/lockscreen";
import { rgba } from "@/lib/logic/theme";

export interface DrawInput {
  pinned: { text: string; by: string };
  look: Look;
  /** The CSS font-family string to draw with. */
  family: string;
  /** 1 is the full 1179 x 2556. A preview uses a fraction. */
  scale: number;
  /** Draw a stand-in for the iOS clock, so the preview shows what the quote stays clear of. */
  clock?: boolean;
}

/** The family the page is set in, as the canvas needs it (the variable on the root resolved to its real name). */
export function pageFamily(): string {
  return getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
}

/** Wait until the typeface is really there, so the first draw is not in a fallback. */
export async function loadFont(family: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.ready;
    await document.fonts.load(`500 48px ${family}`);
  } catch {
    // Draw in whatever the browser has.
  }
}

export function drawWallpaper(canvas: HTMLCanvasElement, { pinned, look, family, scale, clock }: DrawInput): void {
  const W = Math.round(WALLPAPER.width * scale);
  const H = Math.round(WALLPAPER.height * scale);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);

  ctx.fillStyle = look.background;
  ctx.fillRect(0, 0, WALLPAPER.width, WALLPAPER.height);
  for (const l of look.lights) {
    const g = ctx.createRadialGradient(l.x * WALLPAPER.width, l.y * WALLPAPER.height, 0, l.x * WALLPAPER.width, l.y * WALLPAPER.height, l.r * WALLPAPER.height);
    g.addColorStop(0, rgba(l.color, l.alpha));
    g.addColorStop(1, rgba(l.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WALLPAPER.width, WALLPAPER.height);
  }

  ctx.textBaseline = "top";
  const font = (size: number) => `500 ${size}px ${family}`;
  const layout = layoutWallpaper(pinned, (s, size) => {
    ctx.font = font(size);
    return ctx.measureText(s).width;
  });

  if (clock) {
    ctx.fillStyle = look.ink2;
    ctx.textAlign = "center";
    ctx.font = font(60);
    ctx.fillText("Tuesday 14 October", WALLPAPER.width / 2, 330);
    ctx.font = font(300);
    ctx.fillText("9:41", WALLPAPER.width / 2, 400);
    ctx.textAlign = "left";
  }

  ctx.textAlign = "left";
  ctx.fillStyle = look.ink;
  ctx.font = font(layout.quote.size);
  layout.quote.lines.forEach((line, i) => {
    ctx.fillText(line, layout.x, layout.quote.y + i * layout.quote.lineHeight + Math.round((layout.quote.lineHeight - layout.quote.size) / 2));
  });
  if (layout.by) {
    ctx.fillStyle = look.ink2;
    ctx.font = font(layout.by.size);
    ctx.fillText(layout.by.text, layout.x, layout.by.y);
  }
}

/** The wallpaper as a PNG at full iPhone size. */
export async function renderWallpaper(input: Omit<DrawInput, "scale" | "clock">): Promise<Blob> {
  await loadFont(input.family);
  const canvas = document.createElement("canvas");
  drawWallpaper(canvas, { ...input, scale: 1 });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The picture could not be made.");
  return blob;
}

export type SaveResult = "shared" | "downloaded" | "cancelled";

/**
 * Hand the picture over. On a phone the share sheet opens with Save Image in
 * it. Where sharing a file is not possible, the browser downloads it.
 */
export async function saveWallpaper(blob: Blob, name: string): Promise<SaveResult> {
  const file = new File([blob], name, { type: "image/png" });
  if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Any other refusal falls through to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
