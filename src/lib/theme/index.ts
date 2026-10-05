"use client";

// The theme at runtime. A theme is data: a base ("dark" or "contrast") plus an
// optional palette on top. This module turns that into CSS variables on the
// root element, keeps it in the theme table, and keeps a copy on the device so
// the inline script in the root layout can paint it before anything shows.
//
//   import { setThemeFromPalette, resetTheme, setBaseTheme, previewTheme, useTheme } from "@/lib/theme";
//
// Every palette goes through buildTheme() in logic/theme, which derives the
// missing steps and fixes contrast, so nothing set here can make the app
// unreadable.

import { useSyncExternalStore } from "react";
import { db } from "@/lib/db";
import { BASE_THEMES, THEME_CACHE_KEY, buildTheme, cleanPalette, isThemeBase, themeVars, type Theme } from "@/lib/logic/theme";
import type { ThemeBase, ThemePalette, ThemeRow } from "@/lib/types";

export interface ThemeState {
  base: ThemeBase;
  /** The palette on top of the base, as it was asked for. Null for the base alone. */
  palette: ThemePalette | null;
  /** The board the palette came from. */
  boardId: string | null;
  name: string | null;
  /** The finished theme: every token, after contrast fixes. `theme.adjusted` lists what was moved. */
  theme: Theme;
  /** True while previewTheme() is showing something that is not saved. */
  previewing: boolean;
}

interface Saved {
  base: ThemeBase;
  palette: ThemePalette | null;
  boardId: string | null;
  name: string | null;
}

const DEFAULT: Saved = { base: "dark", palette: null, boardId: null, name: null };

function stateOf(saved: Saved, previewing = false): ThemeState {
  return { ...saved, theme: buildTheme(saved.base, saved.palette), previewing };
}

function readCache(): Saved {
  try {
    if (typeof window === "undefined") return DEFAULT;
    const raw = window.localStorage.getItem(THEME_CACHE_KEY);
    if (!raw) return DEFAULT;
    const c = JSON.parse(raw) as Partial<Saved>;
    return {
      base: isThemeBase(c.base) ? c.base : "dark",
      palette: cleanPalette(c.palette ?? null),
      boardId: typeof c.boardId === "string" ? c.boardId : null,
      name: typeof c.name === "string" ? c.name : null,
    };
  } catch {
    return DEFAULT;
  }
}

function writeCache(saved: Saved, theme: Theme): void {
  try {
    const plain = saved.base === "dark" && !saved.palette;
    if (plain) window.localStorage.removeItem(THEME_CACHE_KEY);
    else window.localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ ...saved, scheme: theme.scheme, vars: themeVars(theme) }));
  } catch {
    // Private mode or a full store. The theme still applies, it just is not there before first paint next time.
  }
}

/** Put a theme on the page. Sets the CSS variables on the root element and the browser chrome color. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeVars(theme))) root.style.setProperty(name, value);
  root.style.colorScheme = theme.scheme;
  root.dataset.theme = theme.base;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.tokens.bg);
}

// ---------- the store ----------

let saved: Saved = DEFAULT;
let state: ThemeState = stateOf(DEFAULT);
let started = false;
const listeners = new Set<() => void>();
const SERVER_STATE = stateOf(DEFAULT);

function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  saved = readCache();
  state = stateOf(saved);
}

function set(next: Saved, previewing = false): Theme {
  if (!previewing) saved = next;
  state = stateOf(next, previewing);
  applyTheme(state.theme);
  if (!previewing) writeCache(next, state.theme);
  for (const fn of Array.from(listeners)) fn();
  return state.theme;
}

function subscribe(fn: () => void): () => void {
  start();
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The theme on screen right now. */
export function getTheme(): ThemeState {
  start();
  return state;
}

/**
 * The theme, live, with the functions that change it.
 *
 *   const { base, palette, theme, setBase, setFromPalette, reset } = useTheme();
 */
export function useTheme(): ThemeState & {
  setBase: typeof setBaseTheme;
  setFromPalette: typeof setThemeFromPalette;
  reset: typeof resetTheme;
  preview: typeof previewTheme;
} {
  const s = useSyncExternalStore(subscribe, getTheme, () => SERVER_STATE);
  return { ...s, setBase: setBaseTheme, setFromPalette: setThemeFromPalette, reset: resetTheme, preview: previewTheme };
}

// ---------- saving ----------

function fromRow(row: ThemeRow | null): Saved {
  if (!row) return DEFAULT;
  return { base: isThemeBase(row.base) ? row.base : "dark", palette: cleanPalette(row.palette), boardId: row.board_id ?? null, name: row.name ?? null };
}

/** Make `next` the one active row. Others are switched off first, since only one may be active. */
async function activate(next: Saved): Promise<void> {
  const rows = await db.list("theme");
  const match = next.palette ? rows.find((r) => r.palette !== null && (r.board_id ?? null) === next.boardId) : rows.find((r) => r.palette === null);
  for (const r of rows) if (r.active && r.id !== match?.id) await db.update("theme", r.id, { active: false });
  const fields = { name: next.name, base: next.base, palette: next.palette, accent: next.palette?.accent ?? null, board_id: next.boardId, active: true };
  if (match) await db.update("theme", match.id, fields);
  else await db.insert("theme", fields);
}

async function save(next: Saved): Promise<Theme> {
  // Paint first so the change is instant, then store it.
  const theme = set(next);
  try {
    await activate(next);
  } catch {
    // The look is on screen and cached on this device. It will be written on the next change.
  }
  return theme;
}

/**
 * Turn a palette into the app's theme and keep it. Any colors work: missing
 * ones come from the base, and anything unreadable is adjusted (see
 * `theme.adjusted` on the result). `boardId` records which board it came from.
 */
export function setThemeFromPalette(
  palette: ThemePalette,
  options: { boardId?: string | null; name?: string | null; base?: ThemeBase } = {},
): Promise<Theme> {
  start();
  const clean = cleanPalette(palette);
  return save({
    base: options.base ?? saved.base,
    palette: clean,
    boardId: clean ? (options.boardId ?? null) : null,
    name: clean ? (options.name ?? null) : null,
  });
}

/** Switch the base theme. A palette on top stays on top. */
export function setBaseTheme(base: ThemeBase): Promise<Theme> {
  start();
  return save({ ...saved, base: isThemeBase(base) ? base : "dark" });
}

/** Drop the palette and go back to the base theme as it ships. */
export function resetTheme(): Promise<Theme> {
  start();
  return save({ base: saved.base, palette: null, boardId: null, name: null });
}

/**
 * Show a palette without saving it, for trying one out on a board. Pass null
 * to go back to the saved theme. Nothing is stored and nothing is cached.
 */
export function previewTheme(palette: ThemePalette | null, base?: ThemeBase): Theme {
  start();
  if (!palette) return set(saved);
  return set({ base: base ?? saved.base, palette: cleanPalette(palette), boardId: null, name: null }, true);
}

/**
 * Read the saved theme from the database and put it on the page. The app
 * shell calls this once data is reachable, which is what carries a theme to
 * another device in Supabase mode. With no row it is the dark base.
 */
export async function loadTheme(): Promise<Theme> {
  start();
  const row = await db.first("theme", { eq: { active: true } });
  return set(fromRow(row));
}

export { BASE_THEMES };
export type { Theme, ThemeBase, ThemePalette };
