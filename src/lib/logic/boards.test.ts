import { describe, expect, it } from "vitest";
import {
  autoRoles,
  boardPalette,
  chroma,
  cleanBoardName,
  cleanLink,
  colorAt,
  colorDistance,
  coverOf,
  dedupeColors,
  extractPalette,
  hexToLab,
  inkOnColor,
  labToHex,
  layoutBoard,
  linkHost,
  moveId,
  orderPatches,
  roleShifts,
  rolesToPalette,
  sortByLightness,
  tileAt,
  type TileInput,
} from "./boards";
import { auditTheme, buildTheme, contrast, luminance, parseHex } from "./theme";

// ---------- synthetic images ----------

/** A deterministic random number source, so noisy test images are the same every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** An RGBA image made of flat areas. `parts` are [hex, share of the pixels]. `noise` jitters each channel by up to that much. */
function image(parts: [string, number][], size = 64, noise = 0, seed = 7): Uint8ClampedArray {
  const n = size * size;
  const out = new Uint8ClampedArray(n * 4);
  const rand = rng(seed);
  let at = 0;
  parts.forEach(([hex, share], index) => {
    const [r, g, b] = parseHex(hex)!;
    const end = index === parts.length - 1 ? n : Math.min(n, at + Math.round(share * n));
    for (; at < end; at++) {
      const j = () => (noise ? Math.round((rand() * 2 - 1) * noise) : 0);
      out.set([r + j(), g + j(), b + j(), 255], at * 4);
    }
  });
  return out;
}

const near = (palette: string[], hex: string, within = 0.03) => palette.some((p) => colorDistance(p, hex) <= within);

describe("color math", () => {
  it("round trips through OKLab", () => {
    for (const hex of ["#000000", "#ffffff", "#c8f73a", "#8a1f1f", "#3366cc", "#7f7f7f"]) expect(labToHex(hexToLab(hex))).toBe(hex);
  });

  it("measures lightness and colorfulness the way the eye does", () => {
    expect(hexToLab("#ffffff")[0]).toBeCloseTo(1, 3);
    expect(hexToLab("#000000")[0]).toBeCloseTo(0, 3);
    expect(chroma("#808080")).toBeLessThan(0.001);
    expect(chroma("#ff0000")).toBeGreaterThan(0.2);
    expect(colorDistance("#101010", "#111111")).toBeLessThan(0.01);
    expect(colorDistance("#ff0000", "#0000ff")).toBeGreaterThan(0.4);
  });

  it("drops near duplicates and keeps the order", () => {
    expect(dedupeColors(["#ff0000", "#fe0101", "nope", null, "#00F", "#ff0000"])).toEqual(["#ff0000", "#0000ff"]);
  });

  it("sorts dark to light", () => {
    expect(sortByLightness(["#ffffff", "#000000", "#808080"])).toEqual(["#000000", "#808080", "#ffffff"]);
  });

  it("gives a label color that reads on any swatch", () => {
    for (const c of ["#000000", "#ffffff", "#c8f73a", "#8a1f1f", "#777777", "#f4d9e2"]) expect(contrast(inkOnColor(c), c), c).toBeGreaterThanOrEqual(4.5);
  });
});

describe("extractPalette", () => {
  it("finds the known colors of a flat image, most dominant first", () => {
    const p = extractPalette(image([["#1a1a2e", 0.5], ["#e94560", 0.3], ["#f5f0e1", 0.2]]));
    expect(p).toHaveLength(3);
    expect(colorDistance(p[0], "#1a1a2e")).toBeLessThan(0.01);
    expect(colorDistance(p[1], "#e94560")).toBeLessThan(0.01);
    expect(colorDistance(p[2], "#f5f0e1")).toBeLessThan(0.01);
  });

  it("returns one color for a one color image", () => {
    expect(extractPalette(image([["#336699", 1]]))).toEqual(["#336699"]);
  });

  it("sees through noise", () => {
    const p = extractPalette(image([["#22313f", 0.45], ["#d9a441", 0.3], ["#7a8b6f", 0.25]], 64, 10));
    expect(p.length).toBeGreaterThanOrEqual(3);
    expect(p.length).toBeLessThanOrEqual(4);
    expect(colorDistance(p[0], "#22313f")).toBeLessThan(0.04);
    expect(near(p, "#d9a441", 0.04)).toBe(true);
    expect(near(p, "#7a8b6f", 0.04)).toBe(true);
  });

  it("merges shades the eye reads as one color", () => {
    const p = extractPalette(image([["#101010", 0.3], ["#131313", 0.3], ["#0e0e0e", 0.2], ["#c8f73a", 0.2]]));
    expect(p).toHaveLength(2);
    expect(near(p, "#c8f73a", 0.01)).toBe(true);
  });

  it("keeps a small vivid pop and drops a small dull sliver", () => {
    const p = extractPalette(image([["#f2f2f0", 0.6], ["#1c1c1c", 0.382], ["#ff2a1a", 0.01], ["#8d8d8a", 0.008]]));
    expect(near(p, "#ff2a1a", 0.03)).toBe(true);
    expect(near(p, "#8d8d8a", 0.03)).toBe(false);
  });

  it("never returns two colors that look the same, and respects max", () => {
    const parts: [string, number][] = [];
    for (let i = 0; i < 12; i++) parts.push([labToHex([0.25 + i * 0.05, 0.1 * Math.cos(i), 0.1 * Math.sin(i)]), 1 / 12]);
    const p = extractPalette(image(parts, 60), { max: 5 });
    expect(p.length).toBeLessThanOrEqual(5);
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) expect(colorDistance(p[i], p[j])).toBeGreaterThan(0.02);
  });

  it("summarizes a gradient in a few steps", () => {
    const size = 64;
    const px = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) px.set([x * 4, x * 4, x * 4, 255], (y * size + x) * 4);
    const p = extractPalette(px);
    expect(p.length).toBeGreaterThanOrEqual(3);
    expect(p.length).toBeLessThanOrEqual(6);
    const l = p.map((c) => luminance(c));
    expect(Math.min(...l)).toBeLessThan(0.05);
    expect(Math.max(...l)).toBeGreaterThan(0.6);
  });

  it("ignores transparent pixels and copes with nothing", () => {
    const px = image([["#ff0000", 0.5], ["#0000ff", 0.5]], 16);
    for (let i = 0; i < px.length / 2; i += 4) px[i + 3] = 0;
    expect(extractPalette(px)).toEqual(["#0000ff"]);
    expect(extractPalette(new Uint8ClampedArray(0))).toEqual([]);
    expect(extractPalette(new Uint8ClampedArray(16))).toEqual([]);
  });

  it("gives the same answer every time", () => {
    const px = image([["#22313f", 0.4], ["#d9a441", 0.3], ["#7a8b6f", 0.2], ["#efe6d5", 0.1]], 48, 14, 99);
    expect(extractPalette(px)).toEqual(extractPalette(px));
  });
});

describe("colorAt", () => {
  it("reads the color under a point", () => {
    const px = image([["#ff0000", 0.5], ["#0000ff", 0.5]], 10);
    expect(colorAt(px, 10, 10, 0.5, 0.1)).toBe("#ff0000");
    expect(colorAt(px, 10, 10, 0.5, 0.9)).toBe("#0000ff");
    expect(colorAt(px, 10, 10, 2, 2)).toBe("#0000ff");
    expect(colorAt(px, 10, 10, -1, -1)).toBe("#ff0000");
    expect(colorAt(px, 0, 0, 0.5, 0.5)).toBeNull();
  });
});

describe("boardPalette", () => {
  const item = (kind: "image" | "color" | "note", sort_order: number, color: string | null, palette: string[] | null) => ({ kind, sort_order, color, palette });
  it("puts kept swatches first, then each image's main color before any image's second", () => {
    const p = boardPalette([
      item("image", 0, null, ["#111111", "#ff0000"]),
      item("color", 2, "#00ff00", null),
      item("image", 1, null, ["#eeeeee", "#0000ff"]),
      item("note", 3, null, null),
    ]);
    expect(p).toEqual(["#00ff00", "#111111", "#eeeeee", "#ff0000", "#0000ff"]);
  });
  it("drops repeats across images and caps the count", () => {
    expect(boardPalette([item("image", 0, null, ["#111111"]), item("image", 1, null, ["#121212", "#ff0000"])])).toEqual(["#111111", "#ff0000"]);
    const many = Array.from({ length: 20 }, (_, i) => item("color", i, labToHex([0.2 + i * 0.03, 0.15 * Math.cos(i), 0.15 * Math.sin(i)]), null));
    expect(boardPalette(many, 6)).toHaveLength(6);
  });
});

describe("autoRoles", () => {
  const AWKWARD: Record<string, string[]> = {
    pastels: ["#f8d7e3", "#d7e8f8", "#e3f8d7", "#f8f1d7", "#e6d7f8"],
    nearBlack: ["#0a0a0b", "#111114", "#16130f", "#1a1a1a", "#0d1014"],
    oneRed: ["#e10600"],
    earth: ["#8b7355", "#6b5b45", "#a0522d", "#556b2f", "#c2b280"],
    studio: ["#f4f1ea", "#1b1b1b", "#b08d57"],
  };

  it("leaves everything to the base when there are no colors", () => {
    expect(autoRoles([])).toEqual({ background: null, surface: null, text: null, accent: null });
  });

  it("makes one saturated color the accent and nothing else", () => {
    expect(autoRoles(AWKWARD.oneRed)).toEqual({ background: null, surface: null, text: null, accent: "#e10600" });
  });

  it("goes light for pastels with the lightest as the page", () => {
    const r = autoRoles(AWKWARD.pastels);
    expect(r.background).not.toBeNull();
    expect(buildTheme("dark", rolesToPalette(r)).scheme).toBe("light");
    expect(r.accent).not.toBe(r.background);
  });

  it("goes dark for near blacks with the darkest as the page", () => {
    const r = autoRoles(AWKWARD.nearBlack);
    expect(r.background).toBe("#0a0a0b");
    expect(buildTheme("dark", rolesToPalette(r)).scheme).toBe("dark");
  });

  it("picks the most colorful as accent and a far color as text", () => {
    const r = autoRoles(AWKWARD.studio);
    expect(r.accent).toBe("#b08d57");
    expect(r.background).toBe("#f4f1ea");
    expect(r.text).toBe("#1b1b1b");
    const earth = autoRoles(AWKWARD.earth);
    expect(earth.accent).toBe("#a0522d");
    expect(earth.background).toBe("#6b5b45");
    expect(earth.text).toBe("#c2b280");
  });

  it("never uses one color for two roles", () => {
    for (const colors of Object.values(AWKWARD)) {
      const used = Object.values(autoRoles(colors)).filter(Boolean);
      expect(new Set(used).size).toBe(used.length);
    }
  });

  it("gives a theme that passes every contrast pair, on both bases, for awkward palettes", () => {
    for (const [name, colors] of Object.entries(AWKWARD)) {
      for (const base of ["dark", "contrast"] as const) {
        const theme = buildTheme(base, rolesToPalette(autoRoles(colors, base)));
        const failed = auditTheme(theme).filter((c) => !c.pass);
        expect(failed, `${name} on ${base}`).toEqual([]);
      }
    }
  });
});

describe("roleShifts", () => {
  it("reports nothing noticeable when the colors are used as picked", () => {
    const roles = { background: "#0a0a0b", surface: null, text: "#f2efe8", accent: "#c8f73a" };
    const shifts = roleShifts(roles, buildTheme("dark", rolesToPalette(roles)));
    expect(shifts.map((s) => s.role)).toEqual(["background", "text", "accent"]);
    expect(shifts.every((s) => !s.noticeable)).toBe(true);
  });

  it("says so when a color had to move, and which way", () => {
    const roles = { background: "#6b5b45", surface: null, text: null, accent: "#3a0d0d" };
    const shifts = roleShifts(roles, buildTheme("dark", rolesToPalette(roles)));
    const bg = shifts.find((s) => s.role === "background")!;
    const accent = shifts.find((s) => s.role === "accent")!;
    expect(bg.noticeable).toBe(true);
    expect(bg.why).toMatch(/^Darkened/);
    expect(accent.noticeable).toBe(true);
    expect(accent.why).toMatch(/^Lightened/);
    expect(accent.used).not.toBe(accent.asked);
  });

  it("skips roles left to the base", () => {
    expect(roleShifts({ background: null, surface: null, text: null, accent: null }, buildTheme("dark"))).toEqual([]);
  });
});

describe("boards", () => {
  it("cleans names and falls back to the kind", () => {
    expect(cleanBoardName("  Rick   season ", "brand")).toBe("Rick season");
    expect(cleanBoardName("   ", "body")).toBe("Body board");
    expect(cleanBoardName("x".repeat(80), "life")).toHaveLength(40);
  });

  it("reads links", () => {
    expect(cleanLink("ssense.com/en-us/men")).toBe("https://ssense.com/en-us/men");
    expect(cleanLink(" https://www.rickowens.eu/ ")).toBe("https://www.rickowens.eu/");
    expect(cleanLink("just a note")).toBeNull();
    expect(cleanLink("javascript:alert(1)")).toBeNull();
    expect(cleanLink("")).toBeNull();
    expect(linkHost("https://www.rickowens.eu/en/US")).toBe("rickowens.eu");
    expect(linkHost("nope")).toBeNull();
  });

  it("moves an id and writes only the rows that changed", () => {
    expect(moveId(["a", "b", "c", "d"], "d", 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveId(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b"], "zz", 0)).toEqual(["a", "b"]);
    const rows = [
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ];
    expect(orderPatches(["a", "c", "b"], rows)).toEqual([
      { id: "c", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
    expect(orderPatches(["a", "b", "c"], rows)).toEqual([]);
  });

  it("picks the cover", () => {
    const items = [
      { id: "n", kind: "note" as const, sort_order: 0 },
      { id: "i2", kind: "image" as const, sort_order: 2 },
      { id: "i1", kind: "image" as const, sort_order: 1 },
    ];
    expect(coverOf(null, items)?.id).toBe("i1");
    expect(coverOf("i2", items)?.id).toBe("i2");
    expect(coverOf("n", items)?.id).toBe("i1");
    expect(coverOf(null, [items[0]])).toBeNull();
  });
});

describe("layoutBoard", () => {
  const img = (id: string, aspect: number): TileInput => ({ id, kind: "image", aspect });
  const W = 366;
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it("is empty for an empty board", () => {
    expect(layoutBoard([], { width: W })).toEqual({ tiles: [], height: 0 });
  });

  it("opens with the first image at full width and keeps its shape", () => {
    const l = layoutBoard([img("a", 1.25), img("b", 0.8)], { width: W });
    expect(l.tiles[0]).toMatchObject({ x: 0, y: 0, w: W, span: true });
    expect(l.tiles[0].w / l.tiles[0].h).toBeCloseTo(1.25, 1);
  });

  it("keeps every tile inside the width, with no overlaps, for a mixed board", () => {
    const rand = rng(3);
    const items: TileInput[] = Array.from({ length: 40 }, (_, i) => {
      const r = rand();
      if (r < 0.2) return { id: `c${i}`, kind: "color" };
      if (r < 0.35) return { id: `n${i}`, kind: "note", chars: Math.round(rand() * 200) };
      return img(`i${i}`, 0.5 + rand() * 1.6);
    });
    const l = layoutBoard(items, { width: W });
    expect(l.tiles).toHaveLength(items.length);
    for (const t of l.tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w).toBeLessThanOrEqual(W);
      expect(t.y + t.h).toBeLessThanOrEqual(l.height);
      expect(t.h).toBeGreaterThan(0);
    }
    for (let i = 0; i < l.tiles.length; i++) for (let j = i + 1; j < l.tiles.length; j++) expect(overlaps(l.tiles[i], l.tiles[j]), `${i} and ${j}`).toBe(false);
  });

  it("uses two columns of different widths and swaps them after a full width piece", () => {
    const l = layoutBoard([img("hero", 1), img("a", 1), img("b", 1), img("wide", 2), img("c", 1), img("d", 1)], { width: W, gap: 6 });
    const by = Object.fromEntries(l.tiles.map((t) => [t.id, t]));
    expect(by.a.w).not.toBe(by.b.w);
    expect(by.a.w + by.b.w + 6).toBe(W);
    expect(by.wide.span).toBe(true);
    // The wide column changed side after each full width piece.
    expect(by.a.x).toBe(0);
    expect(by.a.w).toBeLessThan(by.b.w);
    expect(by.c.w).toBeGreaterThan(by.d.w);
  });

  it("leaves no hole above a full width piece: the short column is grown to meet the other", () => {
    const l = layoutBoard([img("hero", 1), img("a", 1), img("b", 1), img("wide", 2)], { width: W, gap: 6 });
    const by = Object.fromEntries(l.tiles.map((t) => [t.id, t]));
    expect(by.wide.span).toBe(true);
    expect(by.a.y + by.a.h).toBe(by.b.y + by.b.h);
    expect(by.wide.y).toBe(by.a.y + by.a.h + 6);
    expect([by.a.stretched, by.b.stretched]).toContain(true);
  });

  it("puts a wide image in a column when the hole would be too big to close", () => {
    const l = layoutBoard([img("hero", 1), img("tall", 0.5), img("wide", 2)], { width: W });
    const by = Object.fromEntries(l.tiles.map((t) => [t.id, t]));
    expect(by.wide.span).toBe(false);
    expect(by.tall.stretched).toBe(false);
  });

  it("clamps extreme shapes", () => {
    const l = layoutBoard([img("hero", 1), img("strip", 0.05), img("pano", 30)], { width: W, hero: false });
    for (const t of l.tiles) expect(t.h).toBeLessThanOrEqual(t.w / 0.5 + 1);
  });

  it("finds the tile under a point", () => {
    const l = layoutBoard([img("a", 1), img("b", 1), img("c", 1)], { width: W });
    expect(tileAt(l, 10, 10)?.id).toBe("a");
    const b = l.tiles[1];
    expect(tileAt(l, b.x + 5, b.y + 5)?.id).toBe("b");
    expect(tileAt(l, -5, -5)).toBeNull();
  });
});
