// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = {
  lockscreen_token: "a".repeat(32),
  pinned_quote: { text: "Pain is inevitable, suffering is optional", by: "Someone", quote_id: null, pinned_at: "2026-10-14T12:00:00.000Z", wallpaper_style: "lights" },
};

let supabase = true;
vi.mock("@/lib/db", () => ({
  isSupabaseMode: () => supabase,
  db: { get: async () => settings, first: async () => null },
}));

import { writeFileSync } from "node:fs";
import { GET } from "./route";

const call = (qs: string) => GET(new Request(`http://localhost/api/lockscreen/wallpaper.png${qs}`));

describe("GET /api/lockscreen/wallpaper.png", () => {
  beforeEach(() => {
    supabase = true;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  });

  it("says it needs sync without Supabase", async () => {
    supabase = false;
    expect((await call(`?token=${"a".repeat(32)}`)).status).toBe(503);
  });

  it("refuses a missing, short or wrong token the same way", async () => {
    for (const qs of ["", "?token=abc", `?token=${"b".repeat(32)}`]) {
      const res = await call(qs);
      expect(res.status).toBe(401);
    }
  });

  it("answers a PNG at iPhone size for the right token", async () => {
    const res = await call(`?token=${"a".repeat(32)}&style=contrast`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(16)).toBe(1179);
    expect(view.getUint32(20)).toBe(2556);
  }, 30_000);

  it("draws the lights style too", async () => {
    const res = await call(`?token=${"a".repeat(32)}`);
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (process.env.DUMP_PNG) writeFileSync(process.env.DUMP_PNG, bytes);
    expect(bytes.length).toBeGreaterThan(5000);
  }, 30_000);
});
