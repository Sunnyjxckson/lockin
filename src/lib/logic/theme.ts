// Themes as data. Pure functions, no DOM, no db.
//
// A theme is a base ("dark" is Aubergine, the default look, and "contrast" is
// high contrast) plus an optional palette on top (background, surface, text,
// muted, accent). Any palette goes in, a usable theme comes out.
//
// The look has depth: three soft light sources behind the page, frosted glass
// cards with hairline borders, and one gradient (accent to accent-2) that
// means done or primary. So a theme is more than flat colors:
//
// - tokens: solid colors. Page, surfaces, lines, text, the accent pair, the
//   text that sits on the accent, the three light sources
// - fx: strengths. How bright each light is, how much white the glass holds,
//   how solid the floating tab bar is
//
// Every pair the app draws is held to WCAG AA (see auditTheme), measured on
// the real grounds: the page at the brightest point of each light, glass over
// each of those, the tab bar with the worst thing scrolled under it, and the
// accent gradient at both ends and the middle. A color that fails is moved
// along its own lightness until it passes, and a light that would wash text
// out is turned down, so the hue you picked stays and the screen stays
// readable. The minimum is 4.5 to 1. The high contrast base holds 7 to 1.

import type { ThemeBase, ThemePalette } from "../types";

export type Rgb = readonly [number, number, number];

export const TOKEN_NAMES = [
  "bg",
  "surface",
  "surface-2",
  "surface-3",
  "line",
  "line-strong",
  "ink",
  "ink-2",
  "ink-3",
  "accent",
  "accent-2",
  "accent-ink",
  "accent-ink-2",
  "danger",
  "warn",
  "glow-1",
  "glow-2",
  "glow-3",
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type Tokens = Record<TokenName, string>;

/** Strengths, each 0 to 1. Colors are in the tokens. */
export interface ThemeFx {
  /** How strong each light source is at its brightest point on screen. */
  glow: readonly [number, number, number];
  /** Glass: white at the top left of a card and at the bottom right. */
  glassHi: number;
  glassLo: number;
  /** Glass: how much of the page color sits under the white, so a light behind a card is dimmed. */
  glassSmoke: number;
  /** Hairline border on glass. White on a dark page, black on a light one. */
  glassLine: number;
  /** A resting tap tile: fill and border. */
  tile: number;
  tileLine: number;
  /** The unfilled part of a hairline progress line. */
  hair: number;
  /** How solid the floating tab bar is. 1 is opaque. */
  bar: number;
}

export interface Theme {
  base: ThemeBase;
  /** Whether the page is dark with light text or the other way round. */
  scheme: "dark" | "light";
  /** True when a palette sits on top of the base. */
  custom: boolean;
  tokens: Tokens;
  fx: ThemeFx;
  /** Tokens that were moved to meet contrast, or pulled into range. Empty when the palette passed as given. */
  adjusted: TokenName[];
}

export interface BaseTheme {
  id: ThemeBase;
  name: string;
  blurb: string;
  /** Smallest contrast for text. */
  min: number;
  /** Smallest contrast for the main text color. */
  inkMin: number;
  tokens: Tokens;
  fx: ThemeFx;
  /** The strengths used when a palette makes the page light. */
  fxLight: ThemeFx;
}

export const BASE_THEMES: Record<ThemeBase, BaseTheme> = {
  dark: {
    id: "dark",
    name: "Aubergine",
    blurb: "Near black plum, soft light, champagne to rose.",
    min: 4.5,
    inkMin: 7,
    tokens: {
      bg: "#0d0b10",
      surface: "#17141b",
      "surface-2": "#1f1b24",
      "surface-3": "#2a2530",
      line: "#2b2731",
      "line-strong": "#423c4a",
      ink: "#f4efe8",
      "ink-2": "#b9b1c0",
      "ink-3": "#aaa2b1",
      accent: "#e3c79a",
      "accent-2": "#d98fb4",
      "accent-ink": "#0d0b10",
      "accent-ink-2": "#3a2a2e",
      danger: "#ff9b91",
      warn: "#f5a65b",
      "glow-1": "#a85c96",
      "glow-2": "#d6965c",
      "glow-3": "#5c50aa",
    },
    fx: { glow: [0.4, 0.24, 0.3], glassHi: 0.1, glassLo: 0.03, glassSmoke: 0.4, glassLine: 0.12, tile: 0.045, tileLine: 0.08, hair: 0.12, bar: 0.86 },
    fxLight: { glow: [0.3, 0.22, 0.22], glassHi: 0.72, glassLo: 0.42, glassSmoke: 0, glassLine: 0.1, tile: 0.5, tileLine: 0.08, hair: 0.12, bar: 0.86 },
  },
  contrast: {
    id: "contrast",
    name: "High contrast",
    blurb: "Pure black, white text, strong lines.",
    min: 7,
    inkMin: 12,
    tokens: {
      bg: "#000000",
      surface: "#0b0b0b",
      "surface-2": "#161616",
      "surface-3": "#222222",
      line: "#5a5a5a",
      "line-strong": "#8c8c8c",
      ink: "#ffffff",
      "ink-2": "#e2e2e2",
      "ink-3": "#c4c4c4",
      accent: "#f3dcb4",
      "accent-2": "#f4b3d0",
      "accent-ink": "#000000",
      "accent-ink-2": "#2b1d22",
      danger: "#ff9d94",
      warn: "#ffc27a",
      "glow-1": "#a85c96",
      "glow-2": "#d6965c",
      "glow-3": "#5c50aa",
    },
    fx: { glow: [0.1, 0.06, 0.08], glassHi: 0.05, glassLo: 0.02, glassSmoke: 0.5, glassLine: 0.4, tile: 0.03, tileLine: 0.34, hair: 0.3, bar: 1 },
    fxLight: { glow: [0.08, 0.06, 0.06], glassHi: 0.8, glassLo: 0.6, glassSmoke: 0, glassLine: 0.5, tile: 0.6, tileLine: 0.42, hair: 0.3, bar: 1 },
  },
};

export const THEME_BASES: readonly ThemeBase[] = ["dark", "contrast"];

export function isThemeBase(v: unknown): v is ThemeBase {
  return v === "dark" || v === "contrast";
}

// ---------- color math ----------

/** "#rgb" or "#rrggbb" (the hash is optional) to 0..255 channels. Null when it is not a hex color. */
export function parseHex(input: unknown): Rgb | null {
  if (typeof input !== "string") return null;
  const s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)];
  if (/^[0-9a-fA-F]{6}$/.test(s)) return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  return null;
}

function clamp255(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

export function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => clamp255(c).toString(16).padStart(2, "0")).join("")}`;
}

/** A clean "#rrggbb", or null. */
export function normalizeHex(input: unknown): string | null {
  const rgb = parseHex(input);
  return rgb ? toHex(rgb) : null;
}

function rgbOf(color: string): Rgb {
  return parseHex(color) ?? [0, 0, 0];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(color: string | Rgb): number {
  const rgb = typeof color === "string" ? rgbOf(color) : color;
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string | Rgb, b: string | Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `t` of the way from a to b. */
export function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** A see-through color laid over a solid one, as the solid color it looks like. */
export function over(color: string, alpha: number, background: string): string {
  return mix(background, color, alpha);
}

export function rgba(color: string, alpha: number): string {
  const [r, g, b] = rgbOf(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toHsl(rgb: Rgb): [number, number, number] {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** The same hue and saturation at another lightness, 0 to 1. */
export function withLightness(color: string, l: number): string {
  const [h, s] = toHsl(rgbOf(color));
  return toHex(fromHsl(h, s, Math.min(1, Math.max(0, l))));
}

function lightnessOf(color: string): number {
  return toHsl(rgbOf(color))[2];
}

/**
 * Move a color along its own lightness, as little as possible, until `ok`
 * holds. `dir` is 1 for lighter and -1 for darker. Returns null when even the
 * end of the scale (white or black) fails.
 */
function slide(color: string, dir: 1 | -1, ok: (c: string) => boolean): string | null {
  if (ok(color)) return color;
  const end = dir === 1 ? 1 : 0;
  if (!ok(withLightness(color, end))) return null;
  let lo = lightnessOf(color);
  let hi = end;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ok(withLightness(color, mid))) hi = mid;
    else lo = mid;
  }
  return withLightness(color, hi);
}

/**
 * The closest color to `fg`, same hue, that has at least `min` contrast on
 * every background. Tries the direction away from the backgrounds first. When
 * nothing reaches `min`, returns black or white, whichever reads better.
 */
export function ensureContrast(fg: string, backgrounds: readonly string[], min: number): string {
  // Background luminances are worked out once: the search below measures many candidates.
  const lums = backgrounds.map((b) => luminance(b));
  const worst = (c: string) => {
    const l = luminance(c);
    let w = Infinity;
    for (const x of lums) w = Math.min(w, (Math.max(l, x) + 0.05) / (Math.min(l, x) + 0.05));
    return w;
  };
  const ok = (c: string) => worst(c) >= min;
  const clean = normalizeHex(fg) ?? "#808080";
  if (backgrounds.length === 0 || ok(clean)) return clean;
  const dark = lums.reduce((s, b) => s + b, 0) / Math.max(1, lums.length) < 0.18;
  const first: 1 | -1 = dark ? 1 : -1;
  const found = slide(clean, first, ok) ?? slide(clean, first === 1 ? -1 : 1, ok);
  if (found) return found;
  return worst("#ffffff") >= worst("#000000") ? "#ffffff" : "#000000";
}

/** The same color with its hue turned by `deg`, at a given saturation and lightness (each 0 to 1) when passed. */
export function shiftHue(color: string, deg: number, s?: number, l?: number): string {
  const [h, s0, l0] = toHsl(rgbOf(color));
  return toHex(fromHsl((((h + deg) % 360) + 360) % 360, Math.min(1, Math.max(0, s ?? s0)), Math.min(1, Math.max(0, l ?? l0))));
}

/** The same hue and saturation at the lightness that gives this luminance. */
function atLuminance(color: string, target: number): string {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(withLightness(color, mid)) < target) lo = mid;
    else hi = mid;
  }
  return withLightness(color, hi);
}

/** Black or white tinted with the color, whichever reads better on every fill. */
function inkOn(fills: readonly string[], min: number): string {
  const dark = mix(fills[0], "#000000", 0.92);
  const light = mix(fills[0], "#ffffff", 0.94);
  const worst = (c: string) => Math.min(...fills.map((f) => contrast(c, f)));
  return ensureContrast(worst(dark) >= worst(light) ? dark : light, fills, min);
}

// ---------- the grounds text sits on ----------

const WHITE = "#ffffff";
const BLACK = "#000000";

export interface Ground {
  /** "bg", "bg under glow-1", "glass over bg under glow-1". */
  name: string;
  color: string;
}

/** The page: plain, and at the brightest point of each light source. */
export function pageGrounds(tokens: Tokens, fx: ThemeFx): Ground[] {
  const out: Ground[] = [{ name: "bg", color: tokens.bg }];
  ([1, 2, 3] as const).forEach((n) => {
    const a = fx.glow[n - 1];
    if (a > 0) out.push({ name: `bg under glow-${n}`, color: over(tokens[`glow-${n}`], a, tokens.bg) });
  });
  return out;
}

/** Glass over each page ground, at both ends of its own gradient. A resting tile holds less white than glass, so it sits between the page and these. */
export function glassGrounds(tokens: Tokens, fx: ThemeFx): Ground[] {
  const out: Ground[] = [];
  for (const g of pageGrounds(tokens, fx)) {
    const smoked = over(tokens.bg, fx.glassSmoke, g.color);
    out.push({ name: `glass over ${g.name}`, color: over(WHITE, fx.glassHi, smoked) });
    out.push({ name: `glass (far corner) over ${g.name}`, color: over(WHITE, fx.glassLo, smoked) });
  }
  return out;
}

/** The floating tab bar with the worst things that can scroll under it: the page, a light, a done tile, a primary button. */
export function barGrounds(tokens: Tokens, fx: ThemeFx): Ground[] {
  const under: Ground[] = [
    ...pageGrounds(tokens, fx),
    { name: "accent", color: tokens.accent },
    { name: "accent-2", color: tokens["accent-2"] },
    { name: "ink", color: tokens.ink },
  ];
  return under.map((u) => ({ name: `bar over ${u.name}`, color: over(tokens.surface, fx.bar, u.color) }));
}

/** The accent gradient where text can sit on it: both ends and the middle. */
export function accentGrounds(tokens: Tokens): Ground[] {
  return [
    { name: "accent", color: tokens.accent },
    { name: "accent to accent-2, middle", color: mix(tokens.accent, tokens["accent-2"], 0.5) },
    { name: "accent-2", color: tokens["accent-2"] },
  ];
}

function solidGrounds(tokens: Tokens, names: readonly ("surface" | "surface-2" | "surface-3")[]): Ground[] {
  return names.map((n) => ({ name: n, color: tokens[n] }));
}

/** Everything body text is drawn on. */
function textGrounds(tokens: Tokens, fx: ThemeFx): Ground[] {
  return [...pageGrounds(tokens, fx), ...solidGrounds(tokens, ["surface", "surface-2", "surface-3"]), ...glassGrounds(tokens, fx)];
}

/** Everything the accent, danger and warn colors are drawn on as text. */
function signalGrounds(tokens: Tokens, fx: ThemeFx): Ground[] {
  return [...pageGrounds(tokens, fx), ...solidGrounds(tokens, ["surface", "surface-2"]), ...glassGrounds(tokens, fx)];
}

/** What a soft fill (an attention tile, a done chip) is laid over: the page under each light, and the two solid surfaces. */
function softGrounds(tokens: Tokens, fx: ThemeFx): Ground[] {
  return [...pageGrounds(tokens, fx), ...solidGrounds(tokens, ["surface", "surface-2"])];
}

// ---------- building a theme ----------

const SOFT = 0.12;
const LINE = 0.35;

/** How far a background may sit from black (dark) or white (light) and still carry text. */
const RANGE = {
  dark: { bg: 0.035, surface: 0.05 },
  contrast: { bg: 0.008, surface: 0.012 },
} as const;

function atMostLuminance(color: string, max: number): string {
  return slide(color, -1, (c) => luminance(c) <= max) ?? "#000000";
}

function atLeastLuminance(color: string, min: number): string {
  return slide(color, 1, (c) => luminance(c) >= min) ?? "#ffffff";
}

function hasPalette(p: ThemePalette | null | undefined): p is ThemePalette {
  return !!p && [p.background, p.surface, p.text, p.muted, p.accent].some((c) => normalizeHex(c) !== null);
}

/** Only the valid colors of a palette, each as "#rrggbb". Null when nothing is left. */
export function cleanPalette(p: ThemePalette | null | undefined): ThemePalette | null {
  if (!p) return null;
  const out: ThemePalette = {};
  for (const key of ["background", "surface", "text", "muted", "accent"] as const) {
    const hex = normalizeHex(p[key]);
    if (hex) out[key] = hex;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The three light sources for an accent, in the same relation the shipped
 * look has to its champagne: a plum, a warm amber and an indigo. A gray
 * accent has no hue to turn, so it gets quiet gray light.
 */
export function glowsFor(accent: string): [string, string, string] {
  const [, s] = toHsl(rgbOf(accent));
  const k = Math.min(1, s / 0.3);
  return [shiftHue(accent, -80, 0.33 * k, 0.51), shiftHue(accent, -9, 0.6 * k, 0.6), shiftHue(accent, -149, 0.36 * k, 0.49)];
}

/** The far end of the accent gradient: a neighboring hue (the way champagne runs to rose), at the same luminance so one text color reads across it. */
export function accentPairFor(accent: string): string {
  const [, s] = toHsl(rgbOf(accent));
  return atLuminance(shiftHue(accent, -40, Math.min(1, s * 0.9)), luminance(accent));
}

/**
 * A complete theme from a base and an optional palette. With no palette the
 * base comes back exactly as it ships. Never throws: colors that are not hex
 * are ignored, and anything that would be unreadable is adjusted.
 */
export function buildTheme(base: ThemeBase = "dark", palette?: ThemePalette | null): Theme {
  const b = BASE_THEMES[isThemeBase(base) ? base : "dark"];
  if (!hasPalette(palette)) return { base: b.id, scheme: "dark", custom: false, tokens: { ...b.tokens }, fx: { ...b.fx }, adjusted: [] };

  const p = cleanPalette(palette) as ThemePalette;
  const adjusted = new Set<TokenName>();
  const note = (token: TokenName, asked: string | undefined, got: string) => {
    if (asked && asked !== got) adjusted.add(token);
    return got;
  };
  const range = RANGE[b.id];

  // Background: a dark page stays near black and a light one near white, so
  // text has room on either side. The middle carries neither.
  const askedBg = p.background ?? b.tokens.bg;
  const scheme: "dark" | "light" = luminance(askedBg) < 0.18 ? "dark" : "light";
  const pole = scheme === "dark" ? WHITE : BLACK;
  const lightMin = b.id === "contrast" ? 0.85 : 0.6;
  const bg = note("bg", p.background, scheme === "dark" ? atMostLuminance(askedBg, range.bg) : atLeastLuminance(askedBg, lightMin));

  // Surfaces step from the background toward the text. A surface from the
  // palette is used when it sits on the same side as the background.
  const stepped = mix(bg, pole, scheme === "dark" ? 0.045 : 0.035);
  let surface = stepped;
  if (p.surface) {
    const inRange = scheme === "dark" ? atMostLuminance(p.surface, range.surface) : atLeastLuminance(p.surface, lightMin - 0.08);
    surface = note("surface", p.surface, inRange);
  }
  const surface2 = mix(surface, pole, scheme === "dark" ? 0.04 : 0.035);
  const surface3 = mix(surface, pole, scheme === "dark" ? 0.09 : 0.08);

  const strong = b.id === "contrast";
  const line = strong ? ensureContrast(mix(bg, pole, 0.32), [bg, surface], 2.4) : mix(surface, pole, 0.075);
  const lineStrong = strong ? ensureContrast(mix(bg, pole, 0.5), [bg, surface], 4.5) : mix(surface, pole, 0.17);

  // Light sources follow the accent. On a dark page they glow. On a light one
  // they are washes of the same hues.
  const askedAccent = p.accent ?? b.tokens.accent;
  const glows = p.accent ? glowsFor(askedAccent) : ([b.tokens["glow-1"], b.tokens["glow-2"], b.tokens["glow-3"]] as [string, string, string]);
  const draft: Tokens = {
    ...b.tokens,
    bg,
    surface,
    "surface-2": surface2,
    "surface-3": surface3,
    line,
    "line-strong": lineStrong,
    "glow-1": glows[0],
    "glow-2": glows[1],
    "glow-3": glows[2],
  };

  // Turn the lights, then the glass, down until every ground they make is one
  // text can be read on: no brighter (dark page) or darker (light page) than
  // the limit below.
  const start = scheme === "dark" ? b.fx : b.fxLight;
  const fx = { ...start, glow: [...start.glow] as [number, number, number] };
  const edge = luminance(surface3);
  const limit = scheme === "dark" ? Math.max(Math.min(1.05 / b.inkMin, 0.5 / b.min) - 0.05, edge) : edge;
  const within = () => [...pageGrounds(draft, fx), ...glassGrounds(draft, fx)].every((g) => (scheme === "dark" ? luminance(g.color) <= limit + 1e-9 : luminance(g.color) >= limit - 1e-9));
  for (let i = 0; i < 14 && !within(); i++) fx.glow = fx.glow.map((a) => Math.round(a * 0.78 * 1000) / 1000) as [number, number, number];
  if (!within()) fx.glow = [0, 0, 0];
  for (let i = 0; i < 14 && !within(); i++) {
    if (scheme === "dark") fx.glassHi = Math.round(fx.glassHi * 0.75 * 1000) / 1000;
    else fx.glassLo = Math.round((fx.glassLo + (1 - fx.glassLo) * 0.3) * 1000) / 1000;
    fx.glassLo = scheme === "dark" ? Math.min(fx.glassLo, fx.glassHi) : fx.glassLo;
    fx.glassHi = scheme === "light" ? Math.max(fx.glassHi, fx.glassLo) : fx.glassHi;
  }
  if (!within()) {
    fx.glassHi = scheme === "dark" ? 0 : 1;
    fx.glassLo = fx.glassHi;
  }

  // Text, against everything it is drawn on.
  const grounds = textGrounds(draft, fx).map((g) => g.color);
  const askedInk = p.text ?? (scheme === "dark" ? b.tokens.ink : mix(bg, BLACK, 0.93));
  const ink = note("ink", p.text, ensureContrast(askedInk, grounds, b.inkMin));
  // A muted color that was not picked is held a step above the minimum, so it stays apart from ink-3.
  const ink2 = p.muted ? note("ink-2", p.muted, ensureContrast(p.muted, grounds, b.min)) : ensureContrast(mix(ink, bg, 0.26), grounds, b.min + 1);
  const ink3 = ensureContrast(mix(ink2, bg, 0.12), grounds, b.min);

  // The accent, danger and warn have to read as text on the page, on glass
  // and on their own soft fills.
  const signal = signalGrounds(draft, fx).map((g) => g.color);
  const softOn = softGrounds(draft, fx).map((g) => g.color);
  const readable = (asked: string): string => {
    let c = ensureContrast(asked, signal, b.min);
    for (let i = 0; i < 4; i++) {
      const soft = softOn.map((g) => over(c, SOFT, g));
      const next = ensureContrast(c, [...signal, ...soft], b.min);
      if (next === c) break;
      c = next;
    }
    return c;
  };
  const accent = note("accent", p.accent, readable(askedAccent));
  const accent2 = p.accent ? accentPairFor(accent) : atLuminance(b.tokens["accent-2"], luminance(accent));
  const fills = [accent, mix(accent, accent2, 0.5), accent2];
  const accentInk = inkOn(fills, b.min);
  const accentInk2 = ensureContrast(mix(accentInk, accent, 0.22), fills, b.min);

  const tokens: Tokens = {
    ...draft,
    ink,
    "ink-2": ink2,
    "ink-3": ink3,
    accent,
    "accent-2": accent2,
    "accent-ink": accentInk,
    "accent-ink-2": accentInk2,
    danger: readable(scheme === "dark" ? b.tokens.danger : "#c62a20"),
    warn: readable(scheme === "dark" ? b.tokens.warn : "#8a4a00"),
  };

  // The tab bar is see-through. Make it more solid until its labels read with
  // the worst thing under it.
  const barOk = () => barGrounds(tokens, fx).every((g) => contrast(ink2, g.color) >= b.min && contrast(ink, g.color) >= b.inkMin);
  while (fx.bar < 1 && !barOk()) fx.bar = Math.min(1, Math.round((fx.bar + 0.04) * 100) / 100);

  return { base: b.id, scheme, custom: true, tokens, fx, adjusted: TOKEN_NAMES.filter((t) => adjusted.has(t)) };
}

// ---------- checking a theme ----------

export interface ContrastCheck {
  /** "ink on surface-2", "accent on accent-soft over bg", "ink-2 on glass over bg under glow-1". */
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  min: number;
  pass: boolean;
}

/** Every text and background pair the app draws, with its contrast. */
export function auditTheme(theme: Theme): ContrastCheck[] {
  const t = theme.tokens;
  const b = BASE_THEMES[theme.base];
  const out: ContrastCheck[] = [];
  const add = (label: string, fg: string, bg: string, min: number) => {
    const ratio = Math.round(contrast(fg, bg) * 100) / 100;
    out.push({ label, fg, bg, ratio, min, pass: ratio >= min });
  };
  for (const g of textGrounds(t, theme.fx)) {
    add(`ink on ${g.name}`, t.ink, g.color, b.inkMin);
    add(`ink-2 on ${g.name}`, t["ink-2"], g.color, b.min);
    add(`ink-3 on ${g.name}`, t["ink-3"], g.color, b.min);
  }
  for (const c of ["accent", "danger", "warn"] as const) {
    for (const g of signalGrounds(t, theme.fx)) add(`${c} on ${g.name}`, t[c], g.color, b.min);
    for (const g of softGrounds(t, theme.fx)) add(`${c} on ${c}-soft over ${g.name}`, t[c], over(t[c], SOFT, g.color), b.min);
  }
  for (const g of accentGrounds(t)) {
    add(`accent-ink on ${g.name}`, t["accent-ink"], g.color, b.min);
    add(`accent-ink-2 on ${g.name}`, t["accent-ink-2"], g.color, b.min);
  }
  for (const g of barGrounds(t, theme.fx)) {
    add(`ink on ${g.name}`, t.ink, g.color, b.inkMin);
    add(`ink-2 on ${g.name}`, t["ink-2"], g.color, b.min);
  }
  add("bg on ink", t.bg, t.ink, b.inkMin);
  return out;
}

/** True when every pair passes. */
export function themePasses(theme: Theme): boolean {
  return auditTheme(theme).every((c) => c.pass);
}

// ---------- CSS ----------

/** The CSS custom properties for a theme. Set these on the root element. */
export function themeVars(theme: Theme): Record<string, string> {
  const t = theme.tokens;
  const fx = theme.fx;
  const dark = theme.scheme === "dark";
  const edge = dark ? WHITE : BLACK;
  const vars: Record<string, string> = {};
  for (const name of TOKEN_NAMES) if (!name.startsWith("glow-")) vars[`--${name}`] = t[name];
  vars["--accent-soft"] = rgba(t.accent, SOFT);
  vars["--accent-line"] = rgba(t.accent, LINE);
  vars["--accent-glow"] = rgba(t["accent-2"], dark ? 0.24 : 0.3);
  vars["--danger-soft"] = rgba(t.danger, SOFT);
  vars["--warn-soft"] = rgba(t.warn, SOFT);
  vars["--warn-line"] = rgba(t.warn, LINE);
  // Light sources, at their strength.
  vars["--glow-1"] = rgba(t["glow-1"], fx.glow[0]);
  vars["--glow-2"] = rgba(t["glow-2"], fx.glow[1]);
  vars["--glow-3"] = rgba(t["glow-3"], fx.glow[2]);
  // Glass, tiles, hairlines and the floating bar.
  vars["--glass-hi"] = rgba(WHITE, fx.glassHi);
  vars["--glass-lo"] = rgba(WHITE, fx.glassLo);
  vars["--glass-smoke"] = rgba(t.bg, fx.glassSmoke);
  vars["--glass-line"] = rgba(edge, fx.glassLine);
  vars["--tile"] = rgba(WHITE, fx.tile);
  vars["--tile-line"] = rgba(edge, fx.tileLine);
  vars["--hair"] = rgba(edge, fx.hair);
  vars["--bar"] = rgba(t.surface, fx.bar);
  vars["--scrim"] = dark ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.45)";
  vars["--shadow"] = dark ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.22)";
  vars["--picker-invert"] = dark ? "1" : "0";
  return vars;
}

/** What the device keeps so the theme is on the page before the first paint. */
export interface ThemeCache {
  base: ThemeBase;
  scheme: "dark" | "light";
  vars: Record<string, string>;
}

export function themeCache(theme: Theme): ThemeCache {
  return { base: theme.base, scheme: theme.scheme, vars: themeVars(theme) };
}

/** The key the cache is stored under in localStorage. The inline script in the root layout reads it. */
export const THEME_CACHE_KEY = "lockin:pref:theme";

/**
 * The script that runs in <head> before anything paints. It only copies saved
 * values onto the root element, so a missing or broken cache leaves the
 * stylesheet's default theme in place.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_CACHE_KEY)})||"null");if(!t||!t.vars)return;var r=document.documentElement,k;for(k in t.vars){if(k.indexOf("--")===0)r.style.setProperty(k,String(t.vars[k]));}r.style.colorScheme=t.scheme==="light"?"light":"dark";r.dataset.theme=t.base||"dark";var m=document.querySelector('meta[name="theme-color"]');if(m&&t.vars["--bg"])m.setAttribute("content",t.vars["--bg"]);}catch(e){}})();`;
