// Draws the share card on a canvas by hand. No library. The on-screen
// preview is this same canvas, so what you see is the PNG that gets shared.
// Colors and the font come from the app's CSS tokens at draw time.

import { countLabel, type CardData, type CellKind } from "@/lib/logic/progress";

export const CARD_W = 1080;
export const CARD_H = 1350;

export interface CardTheme {
  bg: string;
  ink: string;
  ink2: string;
  ink3: string;
  accent: string;
  accent2: string;
  accentInk: string;
  danger: string;
  hair: string;
  tile: string;
  tileLine: string;
  glow1: string;
  glow2: string;
  glow3: string;
  scrim: string;
  onScrim: string;
  font: string;
}

/** Read the design tokens off the document. Browser only. */
export function readTheme(): CardTheme {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string) => root.getPropertyValue(name).trim();
  return {
    bg: v("--bg"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    ink3: v("--ink-3"),
    accent: v("--accent"),
    accent2: v("--accent-2"),
    accentInk: v("--accent-ink"),
    danger: v("--danger"),
    hair: v("--hair"),
    tile: v("--tile"),
    tileLine: v("--tile-line"),
    glow1: v("--glow-1"),
    glow2: v("--glow-2"),
    glow3: v("--glow-3"),
    scrim: v("--scrim"),
    onScrim: v("--on-scrim"),
    font: getComputedStyle(document.body).fontFamily || "sans-serif",
  };
}

export interface CardImages {
  before?: CanvasImageSource | null;
  after?: CanvasImageSource | null;
}

type Ctx = CanvasRenderingContext2D;

const PAD = 88;
const INNER = CARD_W - PAD * 2;

/** One family, medium for numbers and headings, regular for the rest. Never heavier. */
function font(ctx: Ctx, t: CardTheme, size: number, weight: 400 | 500 = 500, spacing = 0) {
  ctx.font = `${weight} ${size}px ${t.font}`;
  // Not in every browser. Without it the labels are just a little tighter.
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
}

/** The app's gradient, champagne to rose, across a box. */
function gradient(ctx: Ctx, t: CardTheme, x: number, y: number, w: number, h: number): CanvasGradient {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, t.accent);
  g.addColorStop(1, t.accent2);
  return g;
}

/** One soft light: an ellipse of color fading to nothing, like the page's own. */
function light(ctx: Ctx, color: string, cx: number, cy: number, rx: number, ry: number) {
  if (!color) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, color);
  g.addColorStop(0.7, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
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
  const r = Math.max(3, s * 0.3);
  const lw = Math.max(1.5, s * 0.03);
  const outline = () => {
    ctx.lineWidth = lw;
    ctx.strokeStyle = t.tileLine;
    rounded(ctx, x + lw / 2, y + lw / 2, s - lw, s - lw, r);
    ctx.stroke();
  };
  rounded(ctx, x, y, s, s, r);
  if (kind === "full") {
    ctx.fillStyle = gradient(ctx, t, x, y, s, s);
    ctx.fill();
  } else if (kind === "partial" || kind === "missed" || kind === "open") {
    ctx.fillStyle = t.tile;
    ctx.fill();
    outline();
    if (kind === "partial") {
      const bw = s * 0.36;
      const bh = Math.max(2, s * 0.05);
      ctx.fillStyle = gradient(ctx, t, x + (s - bw) / 2, 0, bw, 0);
      rounded(ctx, x + (s - bw) / 2, y + s * 0.72, bw, bh, bh / 2);
      ctx.fill();
    } else if (kind === "missed") {
      ctx.fillStyle = t.danger;
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s * 0.74, Math.max(1.5, s * 0.045), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    outline();
  }
  if (isToday) {
    ctx.lineWidth = lw * 1.5;
    ctx.strokeStyle = t.ink;
    const o = lw * 2.5;
    rounded(ctx, x - o, y - o, s + o * 2, s + o * 2, r + o);
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

function label(ctx: Ctx, t: CardTheme, s: string, x: number, y: number, align: CanvasTextAlign = "left", size = 24) {
  font(ctx, t, size, 500, size * 0.18);
  text(ctx, s.toUpperCase(), x, y, t.ink2, align);
}

function photo(ctx: Ctx, t: CardTheme, img: CanvasImageSource, tag: string, x: number, y: number, w: number, h: number) {
  const r = 44;
  cover(ctx, img, x, y, w, h, r);
  // A fade at the bottom so the tag reads on any photo.
  ctx.save();
  rounded(ctx, x, y, w, h, r);
  ctx.clip();
  const fade = ctx.createLinearGradient(0, y + h - 200, 0, y + h);
  fade.addColorStop(0, "transparent");
  fade.addColorStop(1, t.scrim);
  ctx.fillStyle = fade;
  ctx.fillRect(x, y + h - 200, w, 200);
  ctx.restore();
  font(ctx, t, 24, 500, 24 * 0.18);
  text(ctx, tag.toUpperCase(), x + 34, y + h - 36, t.onScrim);
}

function stat(ctx: Ctx, t: CardTheme, value: string, unit: string, name: string, x: number, y: number, size: number) {
  font(ctx, t, size, 500, -size * 0.035);
  text(ctx, value, x, y, t.ink);
  const w = ctx.measureText(value).width;
  if (unit) {
    font(ctx, t, size * 0.42, 400);
    text(ctx, unit, x + w + 6, y, t.ink2);
  }
  label(ctx, t, name, x, y + 46, "left", 21);
}

function streaks(ctx: Ctx, t: CardTheme, data: CardData, y: number, rowH: number) {
  label(ctx, t, "Top streaks", PAD, y);
  if (data.streaks.length === 0) {
    font(ctx, t, 36, 400);
    text(ctx, data.started ? "Streaks start with the first full item." : "Starts soon.", PAD, y + rowH, t.ink2);
    return;
  }
  data.streaks.forEach((s, i) => {
    const base = y + rowH * (i + 1);
    const count = countLabel(s.current, s.unit);
    font(ctx, t, 40, 500, -1);
    const cw = ctx.measureText(count).width;
    text(ctx, count, CARD_W - PAD, base, t.ink, "right");
    font(ctx, t, 40, 400, -0.5);
    text(ctx, fit(ctx, s.name, INNER - cw - 40), PAD, base, t.ink);
    if (i < data.streaks.length - 1) {
      ctx.fillStyle = t.hair;
      ctx.fillRect(PAD, base + 24, INNER, 2);
    }
  });
}

/** A hairline that fills with the gradient. */
function line(ctx: Ctx, t: CardTheme, x: number, y: number, w: number, value: number) {
  const h = 6;
  ctx.fillStyle = t.hair;
  rounded(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const v = Math.min(1, Math.max(0, value));
  if (v <= 0) return;
  const fw = Math.max(h, w * v);
  ctx.fillStyle = gradient(ctx, t, x, 0, fw, 0);
  rounded(ctx, x, y, fw, h, h / 2);
  ctx.fill();
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
  // The same three lights the app sits on: plum top right, amber at the left edge, indigo under the bottom.
  light(ctx, t.glow1, CARD_W * 0.85, 0, CARD_W * 0.7, CARD_H * 0.38);
  light(ctx, t.glow2, 0, CARD_H * 0.22, CARD_W * 0.6, CARD_H * 0.3);
  light(ctx, t.glow3, CARD_W * 0.5, CARD_H * 1.1, CARD_W * 0.8, CARD_H * 0.4);

  // Header: the name small and tracked, the dates opposite, like a top bar in the app.
  ctx.fillStyle = gradient(ctx, t, PAD, 92, 22, 22);
  ctx.beginPath();
  ctx.arc(PAD + 11, 103, 11, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, t, "Lock In", PAD + 40, 112);
  label(ctx, t, data.range, CARD_W - PAD, 112, "right");

  const cols = Math.max(10, Math.ceil(data.cells.length / 4));
  const percent = `${data.percent}`;
  const locked = `${data.lockedIn}`;
  const left = data.extra.value;

  if (shots.length === 0) {
    // The big number (the day count, or full days out of the last 30), the grid, three numbers, streaks.
    label(ctx, t, data.eyebrow, PAD, 226);
    font(ctx, t, 280, 500, -280 * 0.045);
    text(ctx, data.big, PAD - 10, 468, t.ink);
    const dw = ctx.measureText(data.big).width;
    font(ctx, t, 64, 400, -1);
    text(ctx, data.bigSub, PAD + dw + 20, 468, t.ink2);
    line(ctx, t, PAD, 522, INNER, data.percent / 100);

    const gh = grid(ctx, t, data.cells, PAD, 576, INNER, cols, 14);
    const sy = 576 + gh + 128;
    const third = INNER / 3;
    stat(ctx, t, percent, "%", "Complete", PAD, sy, 88);
    stat(ctx, t, locked, "", "Days locked in", PAD + third, sy, 88);
    stat(ctx, t, left, "", data.extra.label, PAD + third * 2, sy, 88);
    const ty = sy + 136;
    streaks(ctx, t, data, ty, Math.min(68, (CARD_H - 56 - ty) / Math.max(1, data.streaks.length)));
  } else {
    // The big number and the stats on one row, then the photos.
    label(ctx, t, data.eyebrow, PAD, 212);
    font(ctx, t, 150, 500, -150 * 0.045);
    text(ctx, data.big, PAD - 5, 342, t.ink);
    const dw = ctx.measureText(data.big).width;
    font(ctx, t, 44, 400, -1);
    text(ctx, data.bigSub, PAD + dw + 14, 342, t.ink2);

    const top = 396;
    const ph = 520;
    const half = (INNER - 24) / 2;
    if (shots.length === 2) {
      stat(ctx, t, percent, "%", "Complete", PAD + half + 24, 296, 72);
      stat(ctx, t, locked, "", "Locked in", PAD + half + 24 + half / 2 + 10, 296, 72);
      photo(ctx, t, shots[0].img, shots[0].tag, PAD, top, half, ph);
      photo(ctx, t, shots[1].img, shots[1].tag, PAD + half + 24, top, half, ph);
      // Every day on the card as one strip under the photos.
      grid(ctx, t, data.cells, PAD, top + ph + 40, INNER, data.cells.length, Math.max(3, Math.min(8, 240 / Math.max(1, data.cells.length))));
    } else {
      photo(ctx, t, shots[0].img, shots[0].tag, PAD, top, half, ph);
      const rx = PAD + half + 24;
      const gh = grid(ctx, t, data.cells, rx, top + 4, half, cols, 9);
      const sy = top + gh + 130;
      stat(ctx, t, percent, "%", "Complete", rx, sy, 80);
      stat(ctx, t, locked, "", "Locked in", rx + half / 2 + 10, sy, 80);
      stat(ctx, t, left, "", data.extra.label, rx, sy + 170, 80);
    }
    streaks(ctx, t, data, 1070, 66);
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
