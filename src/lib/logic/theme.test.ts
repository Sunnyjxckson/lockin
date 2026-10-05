import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BASE_THEMES,
  THEME_BASES,
  THEME_BOOT_SCRIPT,
  THEME_CACHE_KEY,
  TOKEN_NAMES,
  auditTheme,
  buildTheme,
  cleanPalette,
  contrast,
  ensureContrast,
  luminance,
  mix,
  normalizeHex,
  over,
  parseHex,
  themeCache,
  themePasses,
  themeVars,
  toHex,
  withLightness,
} from "./theme";
import type { ThemePalette } from "../types";

const HEX = /^#[0-9a-f]{6}$/;

function failures(base: "dark" | "contrast", palette: ThemePalette | null) {
  return auditTheme(buildTheme(base, palette))
    .filter((c) => !c.pass)
    .map((c) => `${c.label} ${c.ratio} < ${c.min}`);
}

// A small fixed generator, so the same palettes are tried on every run.
function generator(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("color math", () => {
  it("reads hex colors, short and long, with or without the hash", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("09090a")).toEqual([9, 9, 10]);
    expect(parseHex("#C8F73A")).toEqual([200, 247, 58]);
    expect(parseHex("red")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex(null)).toBeNull();
    expect(normalizeHex(" #ABC ")).toBe("#aabbcc");
    expect(toHex([300, -4, 127.6])).toBe("#ff0080");
  });

  it("matches the WCAG numbers", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    // The usual reference pair: #767676 on white is the lightest gray that passes AA.
    expect(contrast("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#777777", "#ffffff")).toBeLessThan(4.5);
  });

  it("mixes and lays colors over each other", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#102030", "#102030", 0.3)).toBe("#102030");
    expect(over("#ffffff", 0.5, "#000000")).toBe("#808080");
  });

  it("changes lightness without changing the hue", () => {
    const lighter = withLightness("#8a1f1f", 0.8);
    const [r, g, b] = parseHex(lighter)!;
    expect(r).toBeGreaterThan(g);
    expect(g).toBe(b);
    expect(withLightness("#3366cc", 1)).toBe("#ffffff");
    expect(withLightness("#3366cc", 0)).toBe("#000000");
  });
});

describe("ensureContrast", () => {
  it("leaves a color that already passes alone", () => {
    expect(ensureContrast("#f5f5f2", ["#09090a"], 4.5)).toBe("#f5f5f2");
  });

  it("lightens on a dark background until it passes, and no further than needed", () => {
    const out = ensureContrast("#333344", ["#09090a", "#1b1b1d"], 4.5);
    expect(contrast(out, "#1b1b1d")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(out, "#1b1b1d")).toBeLessThan(4.8);
    const [r, g, b] = parseHex(out)!;
    expect(b).toBeGreaterThan(r);
    expect(r).toBe(g);
  });

  it("darkens on a light background", () => {
    const out = ensureContrast("#ffe45c", ["#ffffff", "#f4f4f4"], 4.5);
    expect(contrast(out, "#f4f4f4")).toBeGreaterThanOrEqual(4.5);
    expect(luminance(out)).toBeLessThan(luminance("#ffe45c"));
  });

  it("falls back to black or white when nothing along the hue can pass", () => {
    const out = ensureContrast("#808080", ["#808080"], 7);
    expect(["#000000", "#ffffff"]).toContain(out);
    expect(out).toBe("#000000");
  });

  it("treats a color that is not hex as mid gray and still returns something readable", () => {
    expect(contrast(ensureContrast("nope", ["#000000"], 4.5), "#000000")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("base themes", () => {
  it.each(THEME_BASES)("%s passes every contrast check as shipped", (base) => {
    expect(failures(base, null)).toEqual([]);
    expect(themePasses(buildTheme(base))).toBe(true);
  });

  it("comes back exactly as shipped when there is no palette", () => {
    for (const base of THEME_BASES) {
      for (const empty of [undefined, null, {}, { accent: "not a color" }] as (ThemePalette | null | undefined)[]) {
        const t = buildTheme(base, empty);
        expect(t.tokens).toEqual(BASE_THEMES[base].tokens);
        expect(t.custom).toBe(false);
        expect(t.adjusted).toEqual([]);
        expect(t.scheme).toBe("dark");
      }
    }
  });

  it("high contrast holds 7 to 1 for all text", () => {
    const worst = Math.min(...auditTheme(buildTheme("contrast")).map((c) => c.ratio));
    expect(worst).toBeGreaterThanOrEqual(7);
  });

  it("falls back to dark for a base it does not know", () => {
    expect(buildTheme("neon" as never).base).toBe("dark");
  });
});

describe("buildTheme with a palette", () => {
  it("keeps a palette that already works", () => {
    const palette = { background: "#0b0d12", text: "#f2f4f8", accent: "#7cc4ff" };
    const t = buildTheme("dark", palette);
    expect(t.custom).toBe(true);
    expect(t.scheme).toBe("dark");
    expect(t.tokens.bg).toBe("#0b0d12");
    expect(t.tokens.ink).toBe("#f2f4f8");
    expect(t.tokens.accent).toBe("#7cc4ff");
    expect(t.adjusted).toEqual([]);
    expect(failures("dark", palette)).toEqual([]);
  });

  it("returns every token as a hex color", () => {
    const t = buildTheme("dark", { background: "#101820", accent: "#ff5a36" });
    for (const name of TOKEN_NAMES) expect(t.tokens[name], name).toMatch(HEX);
  });

  it("derives surfaces that step away from the background toward the text", () => {
    const t = buildTheme("dark", { background: "#0a0f14" }).tokens;
    const l = [t.bg, t.surface, t["surface-2"], t["surface-3"]].map((c) => luminance(c));
    expect(l[1]).toBeGreaterThan(l[0]);
    expect(l[2]).toBeGreaterThan(l[1]);
    expect(l[3]).toBeGreaterThan(l[2]);
    const light = buildTheme("dark", { background: "#f7f3ea" });
    expect(light.scheme).toBe("light");
    const ll = [light.tokens.bg, light.tokens.surface, light.tokens["surface-2"], light.tokens["surface-3"]].map((c) => luminance(c));
    expect(ll[1]).toBeLessThan(ll[0]);
    expect(ll[3]).toBeLessThan(ll[2]);
  });

  it("picks readable text when the palette gives none", () => {
    for (const background of ["#000000", "#101820", "#f7f3ea", "#ffffff", "#e9d8c4"]) {
      const t = buildTheme("dark", { background });
      expect(contrast(t.tokens.ink, t.tokens.bg), background).toBeGreaterThanOrEqual(7);
      expect(contrast(t.tokens["accent-ink"], t.tokens.accent), background).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("fixes text that cannot be read on its background and says so", () => {
    const t = buildTheme("dark", { background: "#111111", text: "#222222", muted: "#1a1a1a" });
    expect(t.adjusted).toEqual(expect.arrayContaining(["ink", "ink-2"]));
    expect(contrast(t.tokens.ink, t.tokens["surface-3"])).toBeGreaterThanOrEqual(7);
    expect(contrast(t.tokens["ink-2"], t.tokens["surface-3"])).toBeGreaterThanOrEqual(4.5);
  });

  it("moves an accent that is too close to the background, keeping its hue", () => {
    const t = buildTheme("dark", { background: "#0a0a0a", accent: "#3a0d0d" });
    expect(t.adjusted).toContain("accent");
    expect(contrast(t.tokens.accent, t.tokens["surface-2"])).toBeGreaterThanOrEqual(4.5);
    const [r, g, b] = parseHex(t.tokens.accent)!;
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it("pulls a mid tone background to one side so text has room", () => {
    const t = buildTheme("dark", { background: "#808080" });
    expect(t.adjusted).toContain("bg");
    expect(failures("dark", { background: "#808080" })).toEqual([]);
  });

  it("does not let a surface from the palette fight the background", () => {
    const t = buildTheme("dark", { background: "#0a0a0a", surface: "#ffffff" });
    expect(t.adjusted).toContain("surface");
    expect(luminance(t.tokens.surface)).toBeLessThan(0.1);
    expect(failures("dark", { background: "#0a0a0a", surface: "#ffffff" })).toEqual([]);
  });

  it("uses black or white on the accent, whichever reads", () => {
    expect(luminance(buildTheme("dark", { accent: "#ffe14d" }).tokens["accent-ink"])).toBeLessThan(0.1);
    const onDarkAccent = buildTheme("dark", { background: "#fafafa", accent: "#1d3fbf" }).tokens;
    expect(luminance(onDarkAccent["accent-ink"])).toBeGreaterThan(0.7);
  });

  it("gives a usable theme for any palette at all", () => {
    const next = generator(20261005);
    const color = () => toHex([next() * 255, next() * 255, next() * 255]);
    const maybe = () => (next() < 0.7 ? color() : undefined);
    for (let i = 0; i < 400; i++) {
      const palette: ThemePalette = { background: maybe(), surface: maybe(), text: maybe(), muted: maybe(), accent: maybe() };
      for (const base of THEME_BASES) {
        expect(failures(base, palette), `${base} ${JSON.stringify(palette)}`).toEqual([]);
      }
    }
  });

  it("handles the worst cases: everything the same color", () => {
    for (const c of ["#000000", "#ffffff", "#808080", "#ff0000", "#00ff00", "#0000ff", "#777777", "#c8f73a"]) {
      const palette = { background: c, surface: c, text: c, muted: c, accent: c };
      for (const base of THEME_BASES) expect(failures(base, palette), `${base} ${c}`).toEqual([]);
    }
  });

  it("holds the high contrast base to 7 to 1 with a palette on top", () => {
    const t = buildTheme("contrast", { background: "#14213d", accent: "#fca311", text: "#e5e5e5" });
    expect(Math.min(...auditTheme(t).map((c) => c.ratio))).toBeGreaterThanOrEqual(7);
    expect(luminance(t.tokens.bg)).toBeLessThanOrEqual(0.012);
  });
});

describe("the stylesheet", () => {
  const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");
  const root = /:root \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const declared: Record<string, string> = {};
  for (const m of root.matchAll(/(--[\w-]+):\s*([^;]+);/g)) declared[m[1]] = m[2].trim();

  it("ships the dark minimal base as its defaults, value for value", () => {
    const vars = themeVars(buildTheme("dark"));
    for (const [name, value] of Object.entries(vars)) expect(declared[name], name).toBe(value);
  });

  it("maps every color token to a Tailwind name", () => {
    for (const name of [...TOKEN_NAMES, "accent-soft", "accent-line", "danger-soft", "warn-soft", "scrim", "shadow"]) {
      expect(css, name).toContain(`--color-${name}: var(--${name});`);
    }
  });

  it("holds no color outside the token block", () => {
    const rest = css.replace(root, "");
    expect(rest).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(rest).not.toMatch(/rgba?\(/);
  });
});

describe("palettes and CSS", () => {
  it("cleans a palette down to its valid colors", () => {
    expect(cleanPalette({ background: "#ABC", accent: "nope", text: "" })).toEqual({ background: "#aabbcc" });
    expect(cleanPalette({ accent: "x" })).toBeNull();
    expect(cleanPalette(null)).toBeNull();
  });

  it("emits every variable the stylesheet reads", () => {
    const vars = themeVars(buildTheme("dark"));
    for (const name of TOKEN_NAMES) expect(vars[`--${name}`]).toMatch(HEX);
    expect(vars["--accent-soft"]).toBe("rgba(200, 247, 58, 0.12)");
    expect(vars["--accent-line"]).toBe("rgba(200, 247, 58, 0.35)");
    expect(vars["--danger-soft"]).toBe("rgba(255, 98, 87, 0.12)");
    expect(vars["--warn-soft"]).toBe("rgba(245, 181, 68, 0.12)");
    expect(vars["--picker-invert"]).toBe("1");
    expect(themeVars(buildTheme("dark", { background: "#ffffff" }))["--picker-invert"]).toBe("0");
  });

  it("builds the cache the boot script reads", () => {
    const cache = themeCache(buildTheme("contrast"));
    expect(cache.base).toBe("contrast");
    expect(cache.scheme).toBe("dark");
    expect(cache.vars["--bg"]).toBe("#000000");
    expect(THEME_BOOT_SCRIPT).toContain(THEME_CACHE_KEY);
    // The script is plain ES5 with no line breaks, so it can sit inline in <head>.
    expect(THEME_BOOT_SCRIPT).not.toMatch(/\n|=>|\bconst\b|\blet\b/);
  });

  it("runs the boot script against a fake document", () => {
    const set: Record<string, string> = {};
    const meta = { content: "", setAttribute: (_k: string, v: string) => void (meta.content = v) };
    const root = { style: { setProperty: (k: string, v: string) => void (set[k] = v), colorScheme: "" }, dataset: {} as Record<string, string> };
    const run = (stored: string | null) =>
      new Function("localStorage", "document", THEME_BOOT_SCRIPT)(
        { getItem: () => stored },
        { documentElement: root, querySelector: () => meta },
      );
    run(null);
    expect(set).toEqual({});
    run("not json");
    expect(set).toEqual({});
    run(JSON.stringify(themeCache(buildTheme("contrast"))));
    expect(set["--bg"]).toBe("#000000");
    expect(root.style.colorScheme).toBe("dark");
    expect(root.dataset.theme).toBe("contrast");
    expect(meta.content).toBe("#000000");
  });
});
