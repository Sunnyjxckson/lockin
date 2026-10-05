// Themes as data. Pure functions, no DOM, no db.
//
// A theme is a base ("dark" is dark minimal, "contrast" is high contrast) plus
// an optional palette on top (background, surface, text, muted, accent). Any
// palette goes in, a usable theme comes out: surface and line steps are
// derived, text is made readable, and every pair the app actually draws is
// held to WCAG AA. A color that fails is moved along its own lightness until
// it passes, so the hue you picked stays and the screen stays readable.
//
// Contrast held, on every theme (see THEME_PAIRS):
// - ink, ink-2 and ink-3 on bg, surface, surface-2 and surface-3
// - accent, danger and warn as text on bg, surface and surface-2, and on their
//   own soft fills over those
// - accent-ink on accent, and bg on ink (the primary button)
// The minimum is 4.5 to 1. The high contrast base holds 7 to 1.

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
  "accent-ink",
  "danger",
  "warn",
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type Tokens = Record<TokenName, string>;

export interface Theme {
  base: ThemeBase;
  /** Whether the page is dark with light text or the other way round. */
  scheme: "dark" | "light";
  /** True when a palette sits on top of the base. */
  custom: boolean;
  tokens: Tokens;
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
}

export const BASE_THEMES: Record<ThemeBase, BaseTheme> = {
  dark: {
    id: "dark",
    name: "Dark minimal",
    blurb: "Near black, quiet lines, one accent.",
    min: 4.5,
    inkMin: 7,
    tokens: {
      bg: "#09090a",
      surface: "#131314",
      "surface-2": "#1b1b1d",
      "surface-3": "#262629",
      line: "#232326",
      "line-strong": "#38383d",
      ink: "#f5f5f2",
      "ink-2": "#a5a5ad",
      "ink-3": "#8c8c93",
      accent: "#c8f73a",
      "accent-ink": "#0c1000",
      danger: "#ff6257",
      warn: "#f5b544",
    },
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
      accent: "#d6ff5c",
      "accent-ink": "#000000",
      danger: "#ff9d94",
      warn: "#ffd27a",
    },
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
  const worst = (c: string) => Math.min(...backgrounds.map((b) => contrast(c, b)));
  const ok = (c: string) => worst(c) >= min;
  const clean = normalizeHex(fg) ?? "#808080";
  if (backgrounds.length === 0 || ok(clean)) return clean;
  const dark = backgrounds.reduce((s, b) => s + luminance(b), 0) / backgrounds.length < 0.18;
  const first: 1 | -1 = dark ? 1 : -1;
  const found = slide(clean, first, ok) ?? slide(clean, first === 1 ? -1 : 1, ok);
  if (found) return found;
  return worst("#ffffff") >= worst("#000000") ? "#ffffff" : "#000000";
}

/** Black or white tinted with the color, whichever reads better on it. */
function inkOn(fill: string, min: number): string {
  const dark = mix(fill, "#000000", 0.92);
  const light = mix(fill, "#ffffff", 0.94);
  const pick = contrast(dark, fill) >= contrast(light, fill) ? dark : light;
  return ensureContrast(pick, [fill], min);
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
 * A complete theme from a base and an optional palette. With no palette the
 * base comes back exactly as it ships. Never throws: colors that are not hex
 * are ignored, and anything that would be unreadable is adjusted.
 */
export function buildTheme(base: ThemeBase = "dark", palette?: ThemePalette | null): Theme {
  const b = BASE_THEMES[isThemeBase(base) ? base : "dark"];
  if (!hasPalette(palette)) return { base: b.id, scheme: "dark", custom: false, tokens: { ...b.tokens }, adjusted: [] };

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
  const pole = scheme === "dark" ? "#ffffff" : "#000000";
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
  const surfaces = [bg, surface, surface2, surface3];

  const strong = b.id === "contrast";
  const line = strong ? ensureContrast(mix(bg, pole, 0.32), [bg, surface], 2.4) : mix(surface, pole, 0.075);
  const lineStrong = strong ? ensureContrast(mix(bg, pole, 0.5), [bg, surface], 4.5) : mix(surface, pole, 0.17);

  // Text.
  const askedInk = p.text ?? (scheme === "dark" ? b.tokens.ink : mix(bg, "#000000", 0.93));
  const ink = note("ink", p.text, ensureContrast(askedInk, surfaces, b.inkMin));
  const askedMuted = p.muted ?? mix(ink, bg, 0.34);
  const ink2 = note("ink-2", p.muted, ensureContrast(askedMuted, surfaces, b.min));
  const ink3 = ensureContrast(mix(ink2, bg, 0.2), surfaces, b.min);

  // The accent has to read as text on the page and on its own soft fill.
  const textGrounds = [bg, surface, surface2];
  const readable = (asked: string): string => {
    let c = ensureContrast(asked, textGrounds, b.min);
    for (let i = 0; i < 4; i++) {
      const soft = textGrounds.map((g) => over(c, SOFT, g));
      const next = ensureContrast(c, [...textGrounds, ...soft], b.min);
      if (next === c) break;
      c = next;
    }
    return c;
  };
  const askedAccent = p.accent ?? b.tokens.accent;
  const accent = note("accent", p.accent, readable(askedAccent));
  const accentInk = inkOn(accent, b.min);

  const tokens: Tokens = {
    bg,
    surface,
    "surface-2": surface2,
    "surface-3": surface3,
    line,
    "line-strong": lineStrong,
    ink,
    "ink-2": ink2,
    "ink-3": ink3,
    accent,
    "accent-ink": accentInk,
    danger: readable(scheme === "dark" ? b.tokens.danger : "#c62a20"),
    warn: readable(scheme === "dark" ? b.tokens.warn : "#8a5a00"),
  };
  return { base: b.id, scheme, custom: true, tokens, adjusted: TOKEN_NAMES.filter((t) => adjusted.has(t)) };
}

// ---------- checking a theme ----------

export interface ContrastCheck {
  /** "ink on surface-2", "accent on accent-soft over bg". */
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
  const grounds = ["bg", "surface", "surface-2", "surface-3"] as const;
  for (const g of grounds) {
    add(`ink on ${g}`, t.ink, t[g], b.inkMin);
    add(`ink-2 on ${g}`, t["ink-2"], t[g], b.min);
    add(`ink-3 on ${g}`, t["ink-3"], t[g], b.min);
  }
  for (const g of ["bg", "surface", "surface-2"] as const) {
    for (const c of ["accent", "danger", "warn"] as const) {
      add(`${c} on ${g}`, t[c], t[g], b.min);
      add(`${c} on ${c}-soft over ${g}`, t[c], over(t[c], SOFT, t[g]), b.min);
    }
  }
  add("accent-ink on accent", t["accent-ink"], t.accent, b.min);
  add("bg on ink", t.bg, t.ink, b.inkMin);
  return out;
}

/** The lowest contrast ratio in a theme, relative to what each pair needs. True when every pair passes. */
export function themePasses(theme: Theme): boolean {
  return auditTheme(theme).every((c) => c.pass);
}

// ---------- CSS ----------

/** The CSS custom properties for a theme. Set these on the root element. */
export function themeVars(theme: Theme): Record<string, string> {
  const t = theme.tokens;
  const vars: Record<string, string> = {};
  for (const name of TOKEN_NAMES) vars[`--${name}`] = t[name];
  vars["--accent-soft"] = rgba(t.accent, SOFT);
  vars["--accent-line"] = rgba(t.accent, LINE);
  vars["--danger-soft"] = rgba(t.danger, SOFT);
  vars["--warn-soft"] = rgba(t.warn, SOFT);
  vars["--scrim"] = theme.scheme === "dark" ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.45)";
  vars["--shadow"] = theme.scheme === "dark" ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.22)";
  vars["--picker-invert"] = theme.scheme === "dark" ? "1" : "0";
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
 * stylesheet's dark minimal theme in place.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_CACHE_KEY)})||"null");if(!t||!t.vars)return;var r=document.documentElement,k;for(k in t.vars){if(k.indexOf("--")===0)r.style.setProperty(k,String(t.vars[k]));}r.style.colorScheme=t.scheme==="light"?"light":"dark";r.dataset.theme=t.base||"dark";var m=document.querySelector('meta[name="theme-color"]');if(m&&t.vars["--bg"])m.setAttribute("content",t.vars["--bg"]);}catch(e){}})();`;
