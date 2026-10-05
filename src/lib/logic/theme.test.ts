import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BASE_THEMES,
  THEME_BASES,
  THEME_BOOT_SCRIPT,
  THEME_CACHE_KEY,
  TOKEN_NAMES,
  accentGrounds,
  accentPairFor,
  auditTheme,
  barGrounds,
  buildTheme,
  cleanPalette,
  contrast,
  ensureContrast,
  glassGrounds,
  glowsFor,
  luminance,
  mix,
  normalizeHex,
  over,
  pageGrounds,
  parseHex,
  shiftHue,
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
        expect(t.fx).toEqual(BASE_THEMES[base].fx);
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

  it("the default look is the aubergine one: near black plum, cream text, champagne to rose", () => {
    const t = BASE_THEMES.dark;
    expect(t.name).toBe("Aubergine");
    expect(t.tokens.bg).toBe("#0d0b10");
    expect(t.tokens.ink).toBe("#f4efe8");
    expect([t.tokens.accent, t.tokens["accent-2"]]).toEqual(["#e3c79a", "#d98fb4"]);
    // Three lights, glass that holds some white, a bar that is not fully solid.
    expect(t.fx.glow.every((a) => a > 0.2)).toBe(true);
    expect(t.fx.glassHi).toBeGreaterThan(t.fx.glassLo);
    expect(t.fx.bar).toBeLessThan(1);
    // High contrast keeps the shape of the look and turns the effects right down.
    expect(Math.max(...BASE_THEMES.contrast.fx.glow)).toBeLessThanOrEqual(0.1);
    expect(BASE_THEMES.contrast.fx.bar).toBe(1);
  });
});

describe("the grounds text is measured on", () => {
  it("counts the page at the brightest point of each light, and glass over each", () => {
    const t = buildTheme("dark");
    const page = pageGrounds(t.tokens, t.fx);
    expect(page.map((g) => g.name)).toEqual(["bg", "bg under glow-1", "bg under glow-2", "bg under glow-3"]);
    expect(page[1].color).toBe(over(t.tokens["glow-1"], t.fx.glow[0], t.tokens.bg));
    for (const g of page.slice(1)) expect(luminance(g.color), g.name).toBeGreaterThan(luminance(t.tokens.bg));
    const glass = glassGrounds(t.tokens, t.fx);
    expect(glass).toHaveLength(page.length * 2);
    // Glass adds white, and dims the light behind it first.
    expect(luminance(glass[0].color)).toBeGreaterThan(luminance(t.tokens.bg));
    expect(glass[2].color).toBe(over("#ffffff", t.fx.glassHi, over(t.tokens.bg, t.fx.glassSmoke, page[1].color)));
  });

  it("leaves a light out once it is turned off", () => {
    const t = buildTheme("dark");
    expect(pageGrounds(t.tokens, { ...t.fx, glow: [0, 0.2, 0] }).map((g) => g.name)).toEqual(["bg", "bg under glow-2"]);
  });

  it("measures the tab bar with a done tile and a primary button under it", () => {
    const t = buildTheme("dark");
    const names = barGrounds(t.tokens, t.fx).map((g) => g.name);
    expect(names).toEqual(expect.arrayContaining(["bar over bg", "bar over bg under glow-1", "bar over accent", "bar over accent-2", "bar over ink"]));
    const solid = barGrounds(t.tokens, { ...t.fx, bar: 1 });
    expect(new Set(solid.map((g) => g.color))).toEqual(new Set([t.tokens.surface]));
  });

  it("audits text on all of them, and the text that sits on the gradient", () => {
    const labels = auditTheme(buildTheme("dark")).map((c) => c.label);
    for (const label of [
      "ink on bg under glow-1",
      "ink-3 on glass over bg under glow-1",
      "ink-2 on glass (far corner) over bg",
      "accent on glass over bg under glow-2",
      "warn on bg under glow-3",
      "accent-ink on accent to accent-2, middle",
      "accent-ink-2 on accent-2",
      "ink-2 on bar over ink",
      "ink on bar over accent",
      "bg on ink",
    ]) {
      expect(labels, label).toContain(label);
    }
    expect(accentGrounds(buildTheme("dark").tokens).map((g) => g.color)).toEqual(["#e3c79a", mix("#e3c79a", "#d98fb4", 0.5), "#d98fb4"]);
  });

  it("fails a theme whose light is too strong for its text, so the audit is not decoration", () => {
    const t = buildTheme("dark");
    const loud = { ...t, fx: { ...t.fx, glow: [0.95, 0.95, 0.95] as const } };
    const failed = auditTheme(loud).filter((c) => !c.pass).map((c) => c.label);
    expect(failed).toEqual(expect.arrayContaining(["ink-3 on bg under glow-1", "ink-2 on glass over bg under glow-2"]));
    const thin = { ...t, fx: { ...t.fx, bar: 0.3 } };
    expect(auditTheme(thin).filter((c) => !c.pass).map((c) => c.label)).toContain("ink-2 on bar over ink");
    const clash = { ...t, tokens: { ...t.tokens, "accent-2": "#3a1030" } };
    expect(auditTheme(clash).filter((c) => !c.pass).map((c) => c.label)).toContain("accent-ink on accent-2");
  });
});

describe("the look under a palette", () => {
  it("turns the lights with the accent, keeping the relation the shipped look has", () => {
    const glows = glowsFor("#e3c79a");
    // Champagne gives a plum, an amber and an indigo, close to the shipped ones.
    const hue = (c: string) => {
      const [r, g, b] = parseHex(c)!;
      return [r, g, b];
    };
    expect(hue(glows[0])[0]).toBeGreaterThan(hue(glows[0])[1]);
    expect(hue(glows[0])[2]).toBeGreaterThan(hue(glows[0])[1]);
    expect(hue(glows[2])[2]).toBeGreaterThan(hue(glows[2])[0]);
    const blue = buildTheme("dark", { accent: "#5aa0ff" });
    expect(blue.tokens["glow-1"]).toBe(glowsFor("#5aa0ff")[0]);
    expect(blue.tokens["glow-1"]).not.toBe(BASE_THEMES.dark.tokens["glow-1"]);
    // A gray accent has no hue: the lights go gray instead of inventing a color.
    for (const g of glowsFor("#888888")) {
      const [r, gg, b] = parseHex(g)!;
      expect(Math.max(r, gg, b) - Math.min(r, gg, b)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the shipped lights when the palette has no accent", () => {
    const t = buildTheme("dark", { background: "#0b1410" });
    expect(t.tokens["glow-1"]).toBe(BASE_THEMES.dark.tokens["glow-1"]);
    expect(t.tokens.accent).toBe(BASE_THEMES.dark.tokens.accent);
  });

  it("pairs the accent with a neighboring hue at the same luminance, so one ink reads across the gradient", () => {
    for (const accent of ["#5aa0ff", "#fca311", "#7ad6a8", "#ff4fa3", "#c8f73a"]) {
      const t = buildTheme("dark", { accent }).tokens;
      expect(t["accent-2"], accent).not.toBe(t.accent);
      expect(Math.abs(luminance(t["accent-2"]) - luminance(t.accent)), accent).toBeLessThan(0.02);
      expect(t["accent-2"]).toBe(accentPairFor(t.accent));
      for (const g of accentGrounds(t)) {
        expect(contrast(t["accent-ink"], g.color), `${accent} ${g.name}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t["accent-ink-2"], g.color), `${accent} ${g.name}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(shiftHue("#ff0000", 120)).toBe("#00ff00");
  });

  it("turns the lights down, not the text up, when a background leaves less room", () => {
    const roomy = buildTheme("dark", { background: "#0b0d12", accent: "#7cc4ff" });
    const tight = buildTheme("dark", { background: "#1c2a3d", accent: "#7cc4ff" });
    expect(roomy.fx.glow).toEqual(BASE_THEMES.dark.fx.glow);
    expect(tight.fx.glow[0]).toBeLessThan(roomy.fx.glow[0]);
    expect(themePasses(tight)).toBe(true);
    // Still a version of the look: glass keeps its white and the two muted steps stay apart.
    expect(tight.fx.glassHi).toBeGreaterThan(0);
    expect(contrast(tight.tokens["ink-2"], tight.tokens.bg)).toBeGreaterThan(contrast(tight.tokens["ink-3"], tight.tokens.bg));
  });

  it("on a light page the lights become washes and the hairlines go dark", () => {
    const t = buildTheme("dark", { background: "#f7f3ea", accent: "#b4532a" });
    expect(t.scheme).toBe("light");
    expect(t.fx.glassHi).toBeGreaterThan(0.5);
    for (const g of pageGrounds(t.tokens, t.fx)) expect(luminance(g.color), g.name).toBeGreaterThanOrEqual(luminance(t.tokens["surface-3"]) - 1e-9);
    const vars = themeVars(t);
    expect(vars["--glass-line"]).toMatch(/^rgba\(0, 0, 0, /);
    expect(vars["--hair"]).toMatch(/^rgba\(0, 0, 0, /);
    expect(themePasses(t)).toBe(true);
  });

  it("makes the tab bar more solid when its labels would not read over a button", () => {
    const next = generator(77);
    const color = () => toHex([next() * 255, next() * 255, next() * 255]);
    let raised = 0;
    for (let i = 0; i < 60; i++) {
      const t = buildTheme("dark", { background: color(), accent: color() });
      expect(t.fx.bar).toBeGreaterThanOrEqual(BASE_THEMES.dark.fx.bar);
      expect(t.fx.bar).toBeLessThanOrEqual(1);
      if (t.fx.bar > BASE_THEMES.dark.fx.bar) raised += 1;
      for (const g of barGrounds(t.tokens, t.fx)) expect(contrast(t.tokens["ink-2"], g.color), g.name).toBeGreaterThanOrEqual(4.5);
    }
    expect(raised).toBeGreaterThan(0);
  });

  it("keeps every strength between 0 and 1 for any palette", () => {
    const next = generator(9);
    const color = () => toHex([next() * 255, next() * 255, next() * 255]);
    for (let i = 0; i < 120; i++) {
      for (const base of THEME_BASES) {
        const { fx } = buildTheme(base, { background: color(), surface: color(), accent: color() });
        for (const v of [...fx.glow, fx.glassHi, fx.glassLo, fx.glassSmoke, fx.glassLine, fx.tile, fx.tileLine, fx.hair, fx.bar]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("buildTheme with a palette", () => {
  it("keeps a palette that already works", () => {
    const palette = { background: "#0b0d12", text: "#f2f4f8", accent: "#8fd0ff" };
    const t = buildTheme("dark", palette);
    expect(t.custom).toBe(true);
    expect(t.scheme).toBe("dark");
    expect(t.tokens.bg).toBe("#0b0d12");
    expect(t.tokens.ink).toBe("#f2f4f8");
    expect(t.tokens.accent).toBe("#8fd0ff");
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

  it("ships the default base as its defaults, value for value", () => {
    const vars = themeVars(buildTheme("dark"));
    for (const [name, value] of Object.entries(vars)) expect(declared[name], name).toBe(value);
  });

  it("maps every color token to a Tailwind name", () => {
    const solid = TOKEN_NAMES.filter((n) => !n.startsWith("glow-"));
    for (const name of [...solid, "accent-soft", "accent-line", "accent-glow", "danger-soft", "warn-soft", "warn-line", "glass-line", "tile", "tile-line", "hair", "bar", "scrim", "shadow"]) {
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
    for (const name of TOKEN_NAMES) if (!name.startsWith("glow-")) expect(vars[`--${name}`]).toMatch(HEX);
    expect(vars["--accent-soft"]).toBe("rgba(227, 199, 154, 0.12)");
    expect(vars["--accent-line"]).toBe("rgba(227, 199, 154, 0.35)");
    expect(vars["--danger-soft"]).toBe("rgba(255, 155, 145, 0.12)");
    expect(vars["--warn-soft"]).toBe("rgba(245, 166, 91, 0.12)");
    // The lights carry their strength, so the stylesheet only places them.
    expect(vars["--glow-1"]).toBe("rgba(168, 92, 150, 0.4)");
    expect(vars["--glow-2"]).toBe("rgba(214, 150, 92, 0.24)");
    expect(vars["--glow-3"]).toBe("rgba(92, 80, 170, 0.3)");
    expect(vars["--glass-hi"]).toBe("rgba(255, 255, 255, 0.1)");
    expect(vars["--glass-smoke"]).toBe("rgba(13, 11, 16, 0.4)");
    expect(vars["--glass-line"]).toBe("rgba(255, 255, 255, 0.12)");
    expect(vars["--bar"]).toBe("rgba(23, 20, 27, 0.86)");
    expect(themeVars(buildTheme("contrast"))["--bar"]).toBe("rgba(11, 11, 11, 1)");
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
