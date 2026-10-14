import { describe, expect, it } from "vitest";
import { BASE_THEMES, buildTheme } from "./theme";
import {
  BOX,
  WALLPAPER,
  breakLines,
  estimateWidth,
  fitText,
  isPinned,
  isToken,
  layoutWallpaper,
  lightsCss,
  lookFor,
  makePinned,
  readPinned,
  sameToken,
  styleOf,
  tokenFrom,
  wallpaperPath,
} from "./lockscreen";

// Ten pixels a character, so the math is easy to check by hand.
const ten = (s: string) => s.length * 10;
const at = "2026-10-14T12:00:00.000Z";

describe("pinning a quote", () => {
  it("tidies the words and keeps the id", () => {
    const p = makePinned({ text: "  Pain is inevitable,\n\n\n\nsuffering   is optional ", by: " Someone ", quote_id: "x-1", wallpaper_style: "lights" }, at);
    expect(p).toEqual({ text: "Pain is inevitable,\n\nsuffering is optional", by: "Someone", quote_id: "x-1", pinned_at: at, wallpaper_style: "lights" });
  });
  it("pins nothing for an empty line, and falls back to the plain style", () => {
    expect(makePinned({ text: "  \n " }, at)).toBeNull();
    expect(makePinned({ text: "Go", wallpaper_style: "neon" }, at)?.wallpaper_style).toBe("plain");
    expect(styleOf(undefined)).toBe("plain");
  });
  it("cuts a very long line and a very long name", () => {
    const p = makePinned({ text: "a".repeat(2000), by: "b".repeat(500) }, at);
    expect(p?.text.length).toBe(600);
    expect(p?.by.length).toBe(80);
  });
  it("reads back only a well shaped value", () => {
    expect(readPinned(null)).toBeNull();
    expect(readPinned({ text: "" })).toBeNull();
    expect(readPinned({ text: "Go", wallpaper_style: "bad" })).toEqual({ text: "Go", by: "", quote_id: null, pinned_at: "", wallpaper_style: "plain" });
  });
  it("tells which quote is pinned", () => {
    const lib = makePinned({ text: "Go", by: "A", quote_id: "a-1" }, at);
    const own = makePinned({ text: "Mine" }, at);
    expect(isPinned(lib, { quote_id: "a-1" })).toBe(true);
    expect(isPinned(lib, { quote_id: "a-2" })).toBe(false);
    expect(isPinned(own, { text: " Mine " })).toBe(true);
    expect(isPinned(own, { quote_id: "a-1" })).toBe(false);
    expect(isPinned(null, { quote_id: "a-1" })).toBe(false);
  });
});

describe("the wallpaper link secret", () => {
  it("makes 32 hex characters and accepts only those", () => {
    const t = tokenFrom(Array.from({ length: 16 }, (_, i) => i * 17));
    expect(t).toMatch(/^[0-9a-f]{32}$/);
    expect(isToken(t)).toBe(true);
    expect(isToken("abc")).toBe(false);
    expect(isToken(null)).toBe(false);
    expect(isToken("Z".repeat(32))).toBe(false);
  });
  it("compares exactly", () => {
    expect(sameToken("a".repeat(32), "a".repeat(32))).toBe(true);
    expect(sameToken("a".repeat(32), "a".repeat(31) + "b")).toBe(false);
    expect(sameToken("a", "ab")).toBe(false);
  });
  it("builds the path", () => {
    expect(wallpaperPath("ab", "lights")).toBe("/api/lockscreen/wallpaper.png?style=lights&token=ab");
  });
});

describe("breaking lines", () => {
  it("wraps at the width", () => {
    expect(breakLines("one two three four", ten, 100)).toEqual(["one two", "three four"]);
  });
  it("keeps a line break in the text", () => {
    expect(breakLines("one\ntwo three", ten, 200)).toEqual(["one", "two three"]);
  });
  it("splits a word wider than the line", () => {
    expect(breakLines("abcdefghij", ten, 40)).toEqual(["abcd", "efgh", "ij"]);
  });
  it("leaves no blank line at the ends", () => {
    expect(breakLines("\n\none\n", ten, 100)).toEqual(["one"]);
  });
  it("gives nothing for nothing", () => {
    expect(breakLines("", ten, 100)).toEqual([]);
  });
});

describe("fitting the type", () => {
  const opts = { max: 100, min: 20, step: 10, leading: 1 };
  const m = (s: string, size: number) => s.length * size * 0.5;
  it("keeps the biggest size when it fits", () => {
    const f = fitText("Go", m, { width: 500, height: 200 }, opts);
    expect(f.size).toBe(100);
    expect(f.fits).toBe(true);
  });
  it("steps down until the block fits the box", () => {
    const text = "Pain is inevitable, suffering is optional";
    const f = fitText(text, m, { width: 400, height: 300 }, opts);
    expect(f.fits).toBe(true);
    expect(f.height).toBeLessThanOrEqual(300);
    expect(f.size).toBeLessThan(100);
    // One step bigger would not have fit.
    const bigger = fitText(text, m, { width: 400, height: 300 }, { ...opts, max: f.size + 10, min: f.size + 10 });
    expect(bigger.fits).toBe(false);
  });
  it("returns the smallest size when nothing fits, and says so", () => {
    const f = fitText("word ".repeat(200), m, { width: 100, height: 50 }, opts);
    expect(f.size).toBe(20);
    expect(f.fits).toBe(false);
  });
});

describe("the wallpaper layout", () => {
  const spans = (l: ReturnType<typeof layoutWallpaper>) => ({ left: l.x, top: l.top, bottom: l.bottom });
  it("puts a short quote in the lower middle, clear of the clock and the controls", () => {
    const l = layoutWallpaper({ text: "Pain is inevitable, suffering is optional", by: "Someone" }, estimateWidth);
    const s = spans(l);
    expect(s.top).toBeGreaterThanOrEqual(BOX.top);
    expect(s.bottom).toBeLessThanOrEqual(BOX.bottom);
    expect(s.top).toBeGreaterThan(WALLPAPER.height * 0.4);
    expect(s.bottom).toBeLessThan(WALLPAPER.height * 0.85);
    expect(l.by?.y).toBeGreaterThan(l.quote.y + l.quote.height - 1);
  });
  it("keeps every line inside the side margins", () => {
    const l = layoutWallpaper({ text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", by: "Will Durant" }, estimateWidth);
    for (const line of l.quote.lines) expect(estimateWidth(line, l.quote.size)).toBeLessThanOrEqual(WALLPAPER.width - BOX.x * 2);
  });
  it("shrinks a long quote to fit the box", () => {
    const long = "It is not that we have a short time to live, but that we waste a lot of it. ".repeat(4).trim();
    const short = layoutWallpaper({ text: "Go", by: "" }, estimateWidth);
    const big = layoutWallpaper({ text: long, by: "Seneca" }, estimateWidth);
    expect(big.quote.size).toBeLessThan(short.quote.size);
    expect(big.top).toBeGreaterThanOrEqual(BOX.top);
    expect(big.bottom).toBeLessThanOrEqual(BOX.bottom);
  });
  it("has no name line for a line you wrote", () => {
    expect(layoutWallpaper({ text: "Mine", by: "" }, estimateWidth).by).toBeNull();
  });
});

describe("the looks", () => {
  const theme = buildTheme("dark", null);
  const contrast = buildTheme("contrast", null);
  it("plain is the page color with the main text", () => {
    const look = lookFor("plain", theme, contrast);
    expect(look.background).toBe(theme.tokens.bg);
    expect(look.ink).toBe(theme.tokens.ink);
    expect(look.lights).toEqual([]);
    expect(lightsCss(look)).toBe(theme.tokens.bg);
  });
  it("lights adds the three lights from the theme", () => {
    const look = lookFor("lights", theme, contrast);
    expect(look.lights).toHaveLength(3);
    expect(look.lights[0].color).toBe(theme.tokens["glow-1"]);
    expect(look.lights[2].alpha).toBe(theme.fx.glow[2]);
    expect(lightsCss(look).match(/radial-gradient/g)).toHaveLength(3);
  });
  it("high contrast uses the high contrast base whatever the current look", () => {
    const look = lookFor("contrast", theme, contrast);
    expect(look.background).toBe(BASE_THEMES.contrast.tokens.bg);
    expect(look.ink).toBe(BASE_THEMES.contrast.tokens.ink);
  });
});
