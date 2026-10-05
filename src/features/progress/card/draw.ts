// Draws the share card on a canvas by hand. No library. The on-screen
// preview is this same canvas, so what you see is the PNG that gets shared.
// Colors and the font come from the app's CSS tokens at draw time.

import { countLabel, type CardData, type CellKind } from "@/lib/logic/progress";

export const CARD_W = 1080;
export const CARD_H = 1350;

export interface CardTheme {
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  lineStrong: string;
  ink: string;
  ink2: string;
  ink3: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  accentLine: string;
  dangerSoft: string;
  font: string;
}

/** Read the design tokens off the document. Browser only. */
export function readTheme(): CardTheme {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string) => root.getPropertyValue(name).trim();
  return {
    bg: v("--bg"),
    surface: v("--surface"),
    surface2: v("--surface-2"),
    line: v("--line"),
    lineStrong: v("--line-strong"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    ink3: v("--ink-3"),
    accent: v("--accent"),
    accentInk: v("--accent-ink"),
    accentSoft: v("--accent-soft"),
    accentLine: v("--accent-line"),
    dangerSoft: v("--danger-soft"),
    font: getComputedStyle(document.body).fontFamily || "sans-serif",
  };
}

export interface CardImages {
  before?: CanvasImageSource | null;
  after?: CanvasImageSource | null;
}

type Ctx = CanvasRenderingContext2D;

const PAD = 80;
const INNER = CARD_W - PAD * 2;

function font(ctx: Ctx, t: CardTheme, size: number, weight = 600, spacing = 0) {
  ctx.font = `${weight} ${size}px ${t.font}`;
  // Not in every browser. Without it the labels are just a little tighter.
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
}

function text(ctx: Ctx, s: string, x: number, y: number, color: string, align: CanvasTextAlign = "left") {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(s, x, y);
}

function fit(ctx: Ctx, s: string, max: number): string {
  if (ctx.measureText(s).width <= max) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(`${out}...`).width > max) out = out.slice(0, -1);
  return `${out.trimEnd()}...`;
}

function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function sizeOf(img: CanvasImageSource): { w: number; h: number } {
  const i = img as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  return { w: Number(i.naturalWidth || i.width || 1), h: Number(i.naturalHeight || i.height || 1) };
}

/** Draw an image so it covers the box, cropped around its center, with round corners. */
function cover(ctx: Ctx, img: CanvasImageSource, x: number, y: number, w: number, h: number, r: number) {
  const { w: iw, h: ih } = sizeOf(img);
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.save();
  rounded(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

function cell(ctx: Ctx, t: CardTheme, kind: CellKind, isToday: boolean, x: number, y: number, s: number) {
  const r = Math.max(3, s * 0.24);
  const lw = Math.max(2, s * 0.045);
  rounded(ctx, x, y, s, s, r);
  if (kind === "full") {
    ctx.fillStyle = t.accent;
    ctx.fill();
  } else if (kind === "partial") {
    ctx.fillStyle = t.accentSoft;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = t.accentLine;
    rounded(ctx, x + lw / 2, y + lw / 2, s - lw, s - lw, r);
    ctx.stroke();
  } else if (kind === "missed") {
    ctx.fillStyle = t.dangerSoft;
    ctx.fill();
  } else if (kind === "open") {
    ctx.fillStyle = t.surface2;
    ctx.fill();
  } else {
    ctx.lineWidth = lw;
    ctx.strokeStyle = t.line;
    rounded(ctx, x + lw / 2, y + lw / 2, s - lw, s - lw, r);
    ctx.stroke();
  }
  if (isToday) {
    ctx.lineWidth = lw * 1.4;
    ctx.strokeStyle = t.ink;
    rounded(ctx, x - lw * 2, y - lw * 2, s + lw * 4, s + lw * 4, r + lw * 2);
    ctx.stroke();
  }
}

/** The day grid in a box `w` wide. Returns the height it used. */
function grid(ctx: Ctx, t: CardTheme, cells: CardData["cells"], x: number, y: number, w: number, cols: number, gap: number): number {
  if (cells.length === 0) return 0;
  const n = Math.max(1, Math.min(cols, cells.length));
  const s = (w - gap * (n - 1)) / n;
  cells.forEach((c, i) => {
    cell(ctx, t, c.kind, c.isToday, x + (i % n) * (s + gap), y + Math.floor(i / n) * (s + gap), s);
  });
  const rows = Math.ceil(cells.length / n);
  return rows * s + (rows - 1) * gap;
}

function label(ctx: Ctx, t: CardTheme, s: string, x: number, y: number, align: CanvasTextAlign = "left", size = 26) {
  font(ctx, t, size, 600, size * 0.1);
  text(ctx, s.toUpperCase(), x, y, t.ink3, align);
}

function photo(ctx: Ctx, t: CardTheme, img: CanvasImageSource, tag: string, x: number, y: number, w: number, h: number) {
  cover(ctx, img, x, y, w, h, 32);
  // A dark fade at the bottom so the tag reads on any photo.
  ctx.save();
  rounded(ctx, x, y, w, h, 32);
  ctx.clip();
  const fade = ctx.createLinearGradient(0, y + h - 180, 0, y + h);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = fade;
  ctx.fillRect(x, y + h - 180, w, 180);
  ctx.restore();
  font(ctx, t, 30, 700, 3);
  text(ctx, tag.toUpperCase(), x + 28, y + h - 30, t.ink);
  ctx.lineWidth = 2;
  ctx.strokeStyle = t.line;
  rounded(ctx, x + 1, y + 1, w - 2, h - 2, 32);
  ctx.stroke();
}

function stat(ctx: Ctx, t: CardTheme, value: string, unit: string, name: string, x: number, y: number, size: number, color: string) {
  font(ctx, t, size, 700, -size * 0.035);
  text(ctx, value, x, y, color);
  const w = ctx.measureText(value).width;
  if (unit) {
    font(ctx, t, size * 0.45, 600);
    text(ctx, unit, x + w + 6, y, t.ink3);
  }
  label(ctx, t, name, x, y + 46, "left", 24);
}

function streaks(ctx: Ctx, t: CardTheme, data: CardData, y: number, rowH: number) {
  label(ctx, t, "Top streaks", PAD, y);
  if (data.streaks.length === 0) {
    font(ctx, t, 38, 500);
    text(ctx, data.started ? "Streaks start with the first full item." : "Starts soon.", PAD, y + rowH, t.ink2);
    return;
  }
  data.streaks.forEach((s, i) => {
    const base = y + rowH * (i + 1);
    const count = countLabel(s.current, s.unit);
    font(ctx, t, 44, 700, -1);
    const cw = ctx.measureText(count).width;
    text(ctx, count, CARD_W - PAD, base, t.accent, "right");
    font(ctx, t, 44, 500, -0.5);
    text(ctx, fit(ctx, s.name, INNER - cw - 40), PAD, base, t.ink);
    if (i < data.streaks.length - 1) {
      ctx.fillStyle = t.line;
      ctx.fillRect(PAD, base + 24, INNER, 2);
    }
  });
}

/** Paint the whole card. The canvas must be CARD_W by CARD_H. */
export function drawCard(ctx: Ctx, data: CardData, theme: CardTheme, images: CardImages = {}) {
  const t = theme;
  const shots = [
    images.before && data.before ? { img: images.before, tag: data.before.label } : null,
    images.after && data.after ? { img: images.after, tag: data.after.label } : null,
  ].filter((p): p is { img: CanvasImageSource; tag: string } => p !== null);

  ctx.save();
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Header.
  ctx.fillStyle = t.accent;
  rounded(ctx, PAD, 86, 26, 26, 7);
  ctx.fill();
  font(ctx, t, 30, 700, 4);
  text(ctx, "LOCK IN", PAD + 42, 110, t.ink);
  font(ctx, t, 28, 500);
  text(ctx, data.range, CARD_W - PAD, 110, t.ink3, "right");

  const cols = Math.max(10, Math.ceil(data.cells.length / 4));
  const percent = `${data.percent}`;
  const locked = `${data.lockedIn}`;
  const left = `${data.remaining}`;

  if (shots.length === 0) {
    // Big day count, the grid, three numbers, streaks.
    label(ctx, t, "Day", PAD, 222);
    font(ctx, t, 260, 700, -12);
    const dayText = `${data.day}`;
    text(ctx, dayText, PAD - 8, 452, t.ink);
    const dw = ctx.measureText(dayText).width;
    font(ctx, t, 72, 600, -2);
    text(ctx, `of ${data.length}`, PAD + dw + 22, 452, t.ink3);

    const gh = grid(ctx, t, data.cells, PAD, 520, INNER, cols, 14);
    const sy = 520 + gh + 132;
    const third = INNER / 3;
    stat(ctx, t, percent, "%", "Complete", PAD, sy, 92, t.accent);
    stat(ctx, t, locked, "", "Days locked in", PAD + third, sy, 92, t.ink);
    stat(ctx, t, left, "", "Days left", PAD + third * 2, sy, 92, t.ink);
    streaks(ctx, t, data, sy + 128, 68);
  } else {
    // Day count and numbers on one row, then the photos.
    label(ctx, t, "Day", PAD, 208);
    font(ctx, t, 150, 700, -7);
    const dayText = `${data.day}`;
    text(ctx, dayText, PAD - 4, 338, t.ink);
    const dw = ctx.measureText(dayText).width;
    font(ctx, t, 48, 600, -1);
    text(ctx, `of ${data.length}`, PAD + dw + 16, 338, t.ink3);

    const top = 392;
    const ph = 520;
    const half = (INNER - 24) / 2;
    if (shots.length === 2) {
      stat(ctx, t, percent, "%", "Complete", PAD + half + 24, 292, 76, t.accent);
      stat(ctx, t, locked, "", "Locked in", PAD + half + 24 + half / 2 + 10, 292, 76, t.ink);
      photo(ctx, t, shots[0].img, shots[0].tag, PAD, top, half, ph);
      photo(ctx, t, shots[1].img, shots[1].tag, PAD + half + 24, top, half, ph);
      // The whole challenge as one strip under the photos.
      grid(ctx, t, data.cells, PAD, top + ph + 40, INNER, data.cells.length, Math.max(3, Math.min(8, 240 / Math.max(1, data.cells.length))));
    } else {
      photo(ctx, t, shots[0].img, shots[0].tag, PAD, top, half, ph);
      const rx = PAD + half + 24;
      const gh = grid(ctx, t, data.cells, rx, top + 4, half, cols, 9);
      const sy = top + gh + 130;
      stat(ctx, t, percent, "%", "Complete", rx, sy, 84, t.accent);
      stat(ctx, t, locked, "", "Locked in", rx + half / 2 + 10, sy, 84, t.ink);
      stat(ctx, t, left, "", "Days left", rx, sy + 170, 84, t.ink);
    }
    streaks(ctx, t, data, 1066, 68);
  }
  ctx.restore();
}

/** PNG bytes for the canvas. */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not make the image"))), "image/png");
  });
}

/** Load a resolved photo URL. Resolves null when it cannot be decoded. */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Supabase public URLs need this or the canvas cannot be exported.
    if (!url.startsWith("data:") && !url.startsWith("blob:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
