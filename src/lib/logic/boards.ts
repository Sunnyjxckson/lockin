// Mood boards. Pure rules, no DOM and no db.
//
// - Color math in OKLab, a perceptual space, so "close" means close to the eye.
// - extractPalette: the main colors of an image from its raw pixels.
// - autoRoles: which palette color plays background, surface, text and accent.
// - roleShifts: where the theme had to move a color to stay readable.
// - layoutBoard: the collage. Two uneven columns that swap sides after every
//   full width piece, each tile at its own aspect ratio.
// - reorder helpers.

import { buildTheme, contrast, luminance, mix, normalizeHex, parseHex, toHex, type Theme, type TokenName } from "./theme";
import type { BoardItem, BoardKind, ThemeBase, ThemePalette } from "../types";

// ---------- color ----------

export type Lab = readonly [number, number, number];

function linear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function gamma(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, c * 255));
}

/** sRGB (0 to 255 each) to OKLab. L runs 0 to 1. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = linear(r);
  const lg = linear(g);
  const lb = linear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function labToRgb(lab: Lab): [number, number, number] {
  const l = Math.pow(lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2], 3);
  const m = Math.pow(lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2], 3);
  const s = Math.pow(lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2], 3);
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function hexToLab(hex: string): Lab {
  const rgb = parseHex(hex) ?? [128, 128, 128];
  return rgbToLab(rgb[0], rgb[1], rgb[2]);
}

export function labToHex(lab: Lab): string {
  return toHex(labToRgb(lab));
}

/** Distance in OKLab. About 0.02 is the smallest step most people see. */
export function labDistance(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function colorDistance(a: string, b: string): number {
  return labDistance(hexToLab(a), hexToLab(b));
}

/** How colorful, 0 for gray. A vivid red is near 0.25. */
export function chroma(hex: string): number {
  const lab = hexToLab(hex);
  return Math.hypot(lab[1], lab[2]);
}

/** Hue angle in degrees, 0 to 360. */
export function hue(hex: string): number {
  const lab = hexToLab(hex);
  const h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
}

/** A dark or light ink, tinted with the color, that reads on top of it. For labels drawn on a swatch. */
export function inkOnColor(hex: string): string {
  const c = normalizeHex(hex) ?? "#808080";
  const dark = mix(c, "#000000", 0.86);
  const light = mix(c, "#ffffff", 0.92);
  const pick = contrast(dark, c) >= contrast(light, c) ? dark : light;
  if (contrast(pick, c) >= 4.5) return pick;
  return contrast("#000000", c) >= contrast("#ffffff", c) ? "#000000" : "#ffffff";
}

/** Drop colors that sit within `min` of one already kept. Order is kept. */
export function dedupeColors(colors: readonly (string | null | undefined)[], min = 0.045): string[] {
  const out: { hex: string; lab: Lab }[] = [];
  for (const raw of colors) {
    const hex = normalizeHex(raw);
    if (!hex) continue;
    const lab = hexToLab(hex);
    if (out.some((o) => labDistance(o.lab, lab) < min)) continue;
    out.push({ hex, lab });
  }
  return out.map((o) => o.hex);
}

/** Dark to light, for showing a palette as one strip. */
export function sortByLightness(colors: readonly string[]): string[] {
  return [...colors].sort((a, b) => hexToLab(a)[0] - hexToLab(b)[0]);
}

// ---------- palette extraction ----------

export interface PaletteOptions {
  /** Most colors to return. Default 6. */
  max?: number;
  /** Colors closer than this are merged. Default 0.07. */
  merge?: number;
}

interface Bin {
  lab: [number, number, number];
  weight: number;
}

/**
 * The main colors of an image, most dominant first, as "#rrggbb".
 *
 * `pixels` is RGBA, four bytes a pixel, as a canvas gives it. Hand in a small
 * copy of the image (64 to 96 pixels on the long side is plenty).
 *
 * How: pixels are binned into a coarse RGB histogram, the bins are clustered
 * by k-means in OKLab starting from spread out seeds, clusters that look the
 * same are merged, and slivers are dropped unless they are a vivid pop of
 * color, which is often the one a designer wants.
 */
export function extractPalette(pixels: ArrayLike<number>, options: PaletteOptions = {}): string[] {
  const max = Math.max(1, options.max ?? 6);
  const merge = options.merge ?? 0.07;

  // 1. Histogram, 5 bits a channel. Keeps the real mean color of every bin.
  const sums = new Map<number, [number, number, number, number]>();
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const s = sums.get(key);
    if (s) {
      s[0] += r;
      s[1] += g;
      s[2] += b;
      s[3] += 1;
    } else sums.set(key, [r, g, b, 1]);
    total += 1;
  }
  if (total === 0) return [];
  const bins: Bin[] = [];
  for (const s of sums.values()) {
    const lab = rgbToLab(s[0] / s[3], s[1] / s[3], s[2] / s[3]);
    bins.push({ lab: [lab[0], lab[1], lab[2]], weight: s[3] / total });
  }
  bins.sort((a, b) => b.weight - a.weight);

  // 2. Seeds: the heaviest bin, then whichever bin is far from every seed and
  //    not too rare. No randomness, so the same image gives the same palette.
  const k = Math.min(Math.max(max + 2, 8), bins.length);
  const seeds: [number, number, number][] = [[...bins[0].lab]];
  const nearest = bins.map((b) => labDistance(b.lab, seeds[0]));
  while (seeds.length < k) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < bins.length; i++) {
      const score = nearest[i] * nearest[i] * Math.sqrt(bins[i].weight);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) break;
    const seed: [number, number, number] = [...bins[best].lab];
    seeds.push(seed);
    for (let i = 0; i < bins.length; i++) nearest[i] = Math.min(nearest[i], labDistance(bins[i].lab, seed));
  }

  // 3. k-means, weighted by how many pixels each bin holds.
  let centers = seeds;
  let weights = new Array<number>(centers.length).fill(0);
  for (let round = 0; round < 16; round++) {
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (const bin of bins) {
      let at = 0;
      let d = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const dc = labDistance(bin.lab, centers[c]);
        if (dc < d) {
          d = dc;
          at = c;
        }
      }
      const a = acc[at];
      a[0] += bin.lab[0] * bin.weight;
      a[1] += bin.lab[1] * bin.weight;
      a[2] += bin.lab[2] * bin.weight;
      a[3] += bin.weight;
    }
    let moved = 0;
    const next: [number, number, number][] = [];
    const nextWeights: number[] = [];
    for (let c = 0; c < centers.length; c++) {
      const a = acc[c];
      if (a[3] === 0) continue;
      const center: [number, number, number] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
      moved = Math.max(moved, labDistance(center, centers[c]));
      next.push(center);
      nextWeights.push(a[3]);
    }
    centers = next;
    weights = nextWeights;
    if (moved < 0.002) break;
  }

  // 4. Merge clusters the eye reads as one color, heaviest first.
  let clusters = centers.map((lab, i) => ({ lab, weight: weights[i] })).sort((a, b) => b.weight - a.weight);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (labDistance(clusters[i].lab, clusters[j].lab) >= merge) continue;
        const a = clusters[i];
        const b = clusters[j];
        const w = a.weight + b.weight;
        a.lab = [(a.lab[0] * a.weight + b.lab[0] * b.weight) / w, (a.lab[1] * a.weight + b.lab[1] * b.weight) / w, (a.lab[2] * a.weight + b.lab[2] * b.weight) / w];
        a.weight = w;
        clusters.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  clusters.sort((a, b) => b.weight - a.weight);

  // 5. Drop slivers, except a vivid one.
  clusters = clusters.filter((c, i) => {
    if (i === 0) return true;
    const vivid = Math.hypot(c.lab[1], c.lab[2]) > 0.11;
    return c.weight >= (vivid ? 0.004 : 0.015);
  });

  return dedupeColors(
    clusters.slice(0, max).map((c) => labToHex(c.lab)),
    0.02,
  );
}

/** The exact color at a point of an RGBA image. x and y run 0 to 1. Averages a small square so one noisy pixel does not decide. */
export function colorAt(pixels: ArrayLike<number>, width: number, height: number, x: number, y: number, radius = 1): string | null {
  if (width <= 0 || height <= 0) return null;
  const cx = Math.min(width - 1, Math.max(0, Math.floor(x * width)));
  const cy = Math.min(height - 1, Math.max(0, Math.floor(y * height)));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let py = cy - radius; py <= cy + radius; py++) {
    for (let px = cx - radius; px <= cx + radius; px++) {
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const i = (py * width + px) * 4;
      if (pixels[i + 3] < 128) continue;
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      n += 1;
    }
  }
  return n === 0 ? null : toHex([r / n, g / n, b / n]);
}

// ---------- a board's palette ----------

/** Every color on a board: the swatches kept on it first, then the colors of its images. Near duplicates are dropped. */
export function boardPalette(items: readonly Pick<BoardItem, "kind" | "color" | "palette" | "sort_order">[], max = 10): string[] {
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const kept = sorted.filter((i) => i.kind === "color").map((i) => i.color);
  // Take the images' colors a rank at a time, so every image gets its main color in before any gets its sixth.
  const fromImages: string[] = [];
  const palettes = sorted.filter((i) => i.kind === "image" && i.palette).map((i) => i.palette as string[]);
  for (let rank = 0; rank < 8; rank++) for (const p of palettes) if (p[rank]) fromImages.push(p[rank]);
  // Swatches were chosen one by one, so only true repeats go. Image colors are merged harder, and never repeat a swatch.
  const chosen = dedupeColors(kept, 0.02);
  const rest = dedupeColors([...chosen, ...fromImages], 0.06).filter((c) => !chosen.includes(c));
  return [...chosen, ...rest].slice(0, max);
}

// ---------- palette to theme roles ----------

export const ROLES = ["background", "surface", "text", "accent"] as const;
export type Role = (typeof ROLES)[number];
export type RoleChoice = Record<Role, string | null>;

export const ROLE_LABEL: Record<Role, string> = { background: "Background", surface: "Cards", text: "Text", accent: "Accent" };
export const ROLE_TOKEN: Record<Role, TokenName> = { background: "bg", surface: "surface", text: "ink", accent: "accent" };

export const NO_ROLES: RoleChoice = { background: null, surface: null, text: null, accent: null };

/**
 * A sensible first pick of which color does what. Null leaves a role to the base theme.
 *
 * - Accent: the most colorful one.
 * - Background: a color that is already dark or already light, whichever the
 *   palette leads with. Mid tones are not used, they would have to move too far.
 * - Text: whatever stands furthest from the background.
 * - Cards: a close neighbor of the background, when there is one.
 */
export function autoRoles(colors: readonly string[], base: ThemeBase = "dark"): RoleChoice {
  const list = dedupeColors(colors, 0.02);
  if (list.length === 0) return { ...NO_ROLES };
  const out: RoleChoice = { ...NO_ROLES };

  const byChroma = [...list].sort((a, b) => chroma(b) - chroma(a));
  if (chroma(byChroma[0]) >= 0.02) out.accent = byChroma[0];
  let rest = list.filter((c) => c !== out.accent);

  const isDark = (c: string) => luminance(c) < 0.18;
  const isLight = (c: string) => luminance(c) > 0.5;
  const lead = rest.find((c) => isDark(c) || isLight(c));
  if (lead) {
    const side = rest.filter(isDark(lead) ? isDark : isLight).sort((a, b) => luminance(a) - luminance(b));
    out.background = isDark(lead) ? side[0] : side[side.length - 1];
    rest = rest.filter((c) => c !== out.background);
  }

  const ground = buildTheme(base, out.background ? { background: out.background } : null).tokens.bg;
  const far = [...rest].sort((a, b) => contrast(b, ground) - contrast(a, ground))[0];
  if (far && contrast(far, ground) >= 3) {
    out.text = far;
    rest = rest.filter((c) => c !== far);
  }

  if (out.background) {
    const bg = out.background;
    const near = rest
      .filter((c) => (isDark(bg) ? isDark(c) : isLight(c)))
      .map((c) => ({ c, d: colorDistance(c, bg) }))
      .filter((x) => x.d >= 0.025 && x.d <= 0.16)
      // Cards in another hue than the page fight it. Grays go with anything.
      .filter((x) => chroma(x.c) < 0.03 || chroma(bg) < 0.03 || Math.abs(((hue(x.c) - hue(bg) + 540) % 360) - 180) < 35)
      .sort((a, b) => a.d - b.d)[0];
    if (near) out.surface = near.c;
  }
  return out;
}

export function rolesToPalette(roles: RoleChoice): ThemePalette {
  const p: ThemePalette = {};
  if (roles.background) p.background = roles.background;
  if (roles.surface) p.surface = roles.surface;
  if (roles.text) p.text = roles.text;
  if (roles.accent) p.accent = roles.accent;
  return p;
}

export function paletteToRoles(p: ThemePalette | null | undefined): RoleChoice {
  return { background: p?.background ?? null, surface: p?.surface ?? null, text: p?.text ?? null, accent: p?.accent ?? null };
}

export interface RoleShift {
  role: Role;
  asked: string;
  used: string;
  distance: number;
  /** True when the eye would notice the difference. */
  noticeable: boolean;
  /** Plain words for what happened. */
  why: string;
}

/** Past this the picked color and the used color no longer look the same. */
export const NOTICEABLE_SHIFT = 0.04;

/** For each role that was given a color, what the theme actually used and how far it moved. */
export function roleShifts(roles: RoleChoice, theme: Theme): RoleShift[] {
  const out: RoleShift[] = [];
  for (const role of ROLES) {
    const asked = normalizeHex(roles[role]);
    if (!asked) continue;
    const used = theme.tokens[ROLE_TOKEN[role]];
    const distance = colorDistance(asked, used);
    const lighter = hexToLab(used)[0] > hexToLab(asked)[0];
    const strong = theme.base === "contrast" ? " High contrast asks for more." : "";
    const why =
      role === "background" || role === "surface"
        ? `${lighter ? "Lightened" : "Darkened"} so text has room to read on it.${strong}`
        : `${lighter ? "Lightened" : "Darkened"} to stay readable on the background.${strong}`;
    out.push({ role, asked, used, distance, noticeable: distance > NOTICEABLE_SHIFT, why });
  }
  return out;
}

// ---------- boards ----------

export const BOARD_KINDS: readonly BoardKind[] = ["body", "brand", "life"];
export const BOARD_KIND_LABEL: Record<BoardKind, string> = { body: "Body", brand: "Brand", life: "Life" };
export const BOARD_KIND_HINT: Record<BoardKind, string> = {
  body: "The physique you are training toward.",
  brand: "The direction of the work and the label.",
  life: "The place, the rooms, the days.",
};

export function cleanBoardName(name: string, kind: BoardKind): string {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 40);
  return n || `${BOARD_KIND_LABEL[kind]} board`;
}

/** A typed or pasted link as a full URL, or null when it is not one. */
export function cleanLink(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(raw) ? `https://${raw}` : null;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "ssense.com" from a link, for showing where a reference points. */
export function linkHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The ids in a new order after moving one of them to `to` (an index in the result). */
export function moveId(ids: readonly string[], id: string, to: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const out = ids.filter((x) => x !== id);
  out.splice(Math.min(out.length, Math.max(0, to)), 0, id);
  return out;
}

/** The sort_order changes that put rows in the order of `ids`. Only rows whose number changes. */
export function orderPatches(ids: readonly string[], current: readonly { id: string; sort_order: number }[]): { id: string; sort_order: number }[] {
  const now = new Map(current.map((r) => [r.id, r.sort_order]));
  const out: { id: string; sort_order: number }[] = [];
  ids.forEach((id, i) => {
    if (now.has(id) && now.get(id) !== i) out.push({ id, sort_order: i });
  });
  return out;
}

/** The image that stands for a board: its chosen cover, else its first image. */
export function coverOf<T extends Pick<BoardItem, "id" | "kind" | "sort_order">>(coverId: string | null, items: readonly T[]): T | null {
  const images = items.filter((i) => i.kind === "image").sort((a, b) => a.sort_order - b.sort_order);
  return images.find((i) => i.id === coverId) ?? images[0] ?? null;
}

// ---------- the collage ----------

export interface TileInput {
  id: string;
  kind: "image" | "color" | "note";
  /** Width over height. Images only. */
  aspect?: number | null;
  /** Length of a note's text, to size its tile. */
  chars?: number;
  /** A note that carries a link. */
  link?: boolean;
}

export interface TileRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when the tile runs the full width. */
  span: boolean;
  /** True when the tile was made taller or shorter than its own shape to close a gap. Images are cropped to fit. */
  stretched: boolean;
}

export interface BoardLayout {
  tiles: TileRect[];
  height: number;
}

export interface LayoutOptions {
  width: number;
  gap?: number;
  /** Share of the width the wide column takes. Default 0.58. */
  split?: number;
  /** The first image opens the board at full width. Default true. */
  hero?: boolean;
}

const MIN_ASPECT = 0.5;
const MAX_ASPECT = 2.4;
/** An image at least this wide for its height can run full width. */
const WIDE = 1.45;
/** How much taller than its own shape a tile may be made to close a gap. */
const MAX_STRETCH = 0.3;
/** How much shorter. */
const MAX_SHRINK = 0.22;

export function clampAspect(aspect: number | null | undefined): number {
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return 0.8;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect));
}

export interface NoteMetrics {
  fontSize: number;
  lineHeight: number;
  /** Lines the text is given. Longer text is cut off with an ellipsis. */
  lines: number;
  height: number;
}

export const NOTE_PAD = 14;

/** How a note is set in a tile of a given width: a short one large like a pull quote, a long one small. The tile and the layout both use this. */
export function noteMetrics(chars: number, w: number, link = false): NoteMetrics {
  const fontSize = chars <= 28 ? 22 : chars <= 90 ? 17 : 14;
  const lineHeight = Math.round(fontSize * (fontSize >= 20 ? 1.14 : 1.3));
  const perLine = Math.max(4, Math.floor((w - NOTE_PAD * 2) / (fontSize * 0.5)));
  // Words do not fill every line, so allow a little more than the plain division.
  const lines = Math.min(10, Math.max(1, Math.ceil((chars * 1.18) / perLine)));
  const text = chars > 0 ? lines * lineHeight : 0;
  return { fontSize, lineHeight, lines, height: NOTE_PAD * 2 + text + (link ? (chars > 0 ? 30 : 20) : 0) };
}

function tileHeight(t: TileInput, w: number, span: boolean): number {
  if (t.kind === "image") {
    // A full width piece is capped so one tall photo cannot take the whole screen.
    const a = clampAspect(t.aspect);
    return Math.round(w / (span ? Math.max(a, 1) : a));
  }
  if (t.kind === "color") return Math.round(Math.max(72, w * 0.62));
  return Math.max(64, noteMetrics(t.chars ?? 0, w, t.link).height);
}

/**
 * Lay a board out as a collage.
 *
 * Two columns of unequal width. Each tile goes to the shorter column at its
 * own aspect ratio. The first image, and any image wide enough, runs the full
 * width, and after each of those the wide column changes side, so the board
 * reads as a layout and not as a grid. Before a full width piece the shorter
 * column's last tile is grown a little to meet the other, so no hole is left.
 * When the hole is too big for that, the piece just takes a column.
 */
export function layoutBoard(items: readonly TileInput[], options: LayoutOptions): BoardLayout {
  const gap = options.gap ?? 6;
  const width = Math.max(120, Math.floor(options.width));
  const split = options.split ?? 0.58;
  const hero = options.hero ?? true;
  const wideW = Math.round((width - gap) * split);
  const narrowW = width - gap - wideW;

  const tiles: TileRect[] = [];
  let wideLeft = true;
  let top = 0;
  /** Running bottom of each column in this section, and the last tile placed in it. */
  let cols = [top, top];
  let last: [TileRect | null, TileRect | null] = [null, null];
  let firstImage = true;

  const colX = (c: number) => (c === 0 ? 0 : (wideLeft ? wideW : narrowW) + gap);
  const colW = (c: number) => ((c === 0) === wideLeft ? wideW : narrowW);

  const kinds = new Map(items.map((i) => [i.id, i.kind]));
  /** How far a tile may grow or shrink. A photo is cropped by this, so it gets less room than a swatch or a note. */
  const give = (tile: TileRect | null, grow: boolean): number => {
    if (!tile) return 0;
    const kind = kinds.get(tile.id);
    if (kind === "image") return Math.floor(tile.h * (grow ? MAX_STRETCH : MAX_SHRINK));
    // A swatch is the same at any height. A note can grow but never shrink, its words need the room.
    if (grow) return tile.h;
    return kind === "color" ? Math.floor(tile.h * 0.3) : 0;
  };

  /** Bring the two columns to the same bottom by growing the short one's last tile and trimming the tall one's. False when they are too far apart. */
  const closeGap = (): boolean => {
    const diff = cols[0] - cols[1];
    if (diff === 0) return true;
    const short = diff > 0 ? 1 : 0;
    const tall = 1 - short;
    const need = Math.abs(diff);
    const grow = give(last[short], true);
    const shrink = give(last[tall], false);
    if (need > grow + shrink) return false;
    const up = Math.min(grow, Math.round((need * grow) / (grow + shrink)));
    const down = need - up;
    const s = last[short];
    const t = last[tall];
    if (s && up > 0) {
      s.h += up;
      s.stretched = true;
      cols[short] += up;
    }
    if (t && down > 0) {
      t.h -= down;
      t.stretched = true;
      cols[tall] -= down;
    }
    return cols[0] === cols[1];
  };

  for (const item of items) {
    const isImage = item.kind === "image";
    const wantsSpan = isImage && ((hero && firstImage) || clampAspect(item.aspect) >= WIDE);
    if (isImage) firstImage = false;
    const empty = cols[0] === top && cols[1] === top;

    if (wantsSpan && (empty || closeGap())) {
      const y = Math.max(cols[0], cols[1]);
      const rect: TileRect = { id: item.id, x: 0, y, w: width, h: tileHeight(item, width, true), span: true, stretched: false };
      tiles.push(rect);
      top = y + rect.h + gap;
      cols = [top, top];
      last = [null, null];
      wideLeft = !wideLeft;
      continue;
    }

    const c = cols[1] < cols[0] ? 1 : 0;
    const w = colW(c);
    const rect: TileRect = { id: item.id, x: colX(c), y: cols[c], w, h: tileHeight(item, w, false), span: false, stretched: false };
    tiles.push(rect);
    cols[c] = rect.y + rect.h + gap;
    last[c] = rect;
  }

  const bottom = Math.max(cols[0], cols[1], top);
  return { tiles, height: Math.max(0, bottom - gap) };
}

/** The tile under a point, or null. For drag and drop. */
export function tileAt(layout: BoardLayout, x: number, y: number): TileRect | null {
  for (const t of layout.tiles) if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return t;
  return null;
}
