// Runs public/sw.js against a fake service worker global and drives its
// handlers directly: push, tap, and the local schedule.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SOURCE = readFileSync(fileURLToPath(new URL("../../../public/sw.js", import.meta.url)), "utf8");
const ORIGIN = "https://lockin.test";

interface Shown {
  title: string;
  options: { body: string; tag: string; renotify?: boolean; showTrigger?: unknown; data: { url: string; key: string | null } };
}

interface FakeClient {
  url: string;
  focus: () => Promise<FakeClient>;
  navigate: (url: string) => Promise<FakeClient>;
  focused: number;
  failFocus?: boolean;
}

function boot(opts: { triggers?: boolean; clients?: FakeClient[] } = {}) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const shown: Shown[] = [];
  const opened: string[] = [];
  const store = new Map<string, unknown>();
  const cache = {
    match: async (u: string) => store.get(u),
    put: async (u: string, r: unknown) => void store.set(u, r),
    keys: async () => [...store.keys()].map((u) => ({ url: ORIGIN + u })),
    delete: async (req: { url: string }) => store.delete(new URL(req.url).pathname),
  };
  const self: Record<string, unknown> = {
    addEventListener: (type: string, fn: (e: unknown) => void) => void (handlers[type] = fn),
    skipWaiting: vi.fn(),
    location: { origin: ORIGIN },
    registration: {
      showNotification: async (title: string, options: Shown["options"]) => void shown.push({ title, options }),
      getNotifications: async () => [],
    },
    clients: {
      claim: async () => undefined,
      matchAll: async () => opts.clients ?? [],
      openWindow: async (url: string) => void opened.push(url),
    },
  };
  class FakeNotification {}
  if (opts.triggers) {
    self.TimestampTrigger = class {
      constructor(public timestamp: number) {}
    };
    (FakeNotification.prototype as Record<string, unknown>).showTrigger = null;
  }
  new Function("self", "caches", "Notification", "Response", "fetch", SOURCE)(
    self,
    { open: async () => cache },
    FakeNotification,
    class {
      constructor(public body: string) {}
    },
    vi.fn(),
  );

  /** Dispatch an event and wait for everything passed to waitUntil. */
  async function emit(type: string, event: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ ...event, waitUntil: (p: Promise<unknown>) => void waits.push(p) });
    return waits;
  }
  return { handlers, shown, opened, store, emit };
}

function client(url: string, failFocus = false): FakeClient {
  const c: FakeClient = {
    url,
    focused: 0,
    failFocus,
    focus: async () => {
      if (c.failFocus) throw new Error("cannot focus");
      c.focused++;
      return c;
    },
    navigate: async (to: string) => {
      c.url = to;
      return c;
    },
  };
  return c;
}

const pushData = (payload: unknown) => ({ json: () => payload, text: () => String(payload) });

describe("service worker: push", () => {
  it("shows the payload with its tag and the screen to open", async () => {
    const sw = boot();
    await Promise.all(await sw.emit("push", { data: pushData({ title: "Wake", body: "Feet on the floor.", url: "/today", tag: "2026-10-06:wake" }) }));
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe("Wake");
    expect(sw.shown[0].options).toMatchObject({
      body: "Feet on the floor.",
      tag: "2026-10-06:wake",
      renotify: true,
      data: { url: "/today", key: "2026-10-06:wake" },
    });
  });

  it("still shows something for an empty or broken payload", async () => {
    const sw = boot();
    await Promise.all(await sw.emit("push", { data: null }));
    await Promise.all(
      await sw.emit("push", {
        data: {
          json: () => {
            throw new Error("not json");
          },
          text: () => "plain words",
        },
      }),
    );
    expect(sw.shown.map((s) => [s.title, s.options.body, s.options.data.url])).toEqual([
      ["Lock In", "", "/today"],
      ["Lock In", "plain words", "/today"],
    ]);
  });

  it("strips dash characters from what it shows", async () => {
    const sw = boot();
    await Promise.all(await sw.emit("push", { data: pushData({ title: "A \u2014 B", body: "1\u20132", tag: "k" }) }));
    expect(sw.shown[0].title + sw.shown[0].options.body).not.toMatch(/[\u2012-\u2015]/);
  });

  it("replaces quietly when the local fallback already showed the same reminder", async () => {
    const sw = boot();
    const item = { key: "2026-10-06:wake", title: "Wake", body: "", url: "/today", at: 1000 };
    await Promise.all(await sw.emit("message", { data: { type: "lockin:schedule", items: [item], now: 1000 } }));
    await Promise.all(await sw.emit("push", { data: pushData({ title: "Wake", tag: item.key }) }));
    expect(sw.shown).toHaveLength(2);
    expect(sw.shown[1].options.tag).toBe(item.key);
    expect(sw.shown[1].options.renotify).toBe(false);
  });
});

describe("service worker: tap", () => {
  const tap = (url: unknown) => ({ notification: { close: vi.fn(), data: url === undefined ? undefined : { url } } });

  it("opens the screen in a new window when the app is closed", async () => {
    const sw = boot();
    const event = tap("/money");
    await Promise.all(await sw.emit("notificationclick", event));
    expect(event.notification.close).toHaveBeenCalled();
    expect(sw.opened).toEqual([`${ORIGIN}/money`]);
  });

  it("focuses the open app and takes it to the screen", async () => {
    const c = client(`${ORIGIN}/settings`);
    const sw = boot({ clients: [c] });
    await Promise.all(await sw.emit("notificationclick", tap("/body/workout")));
    expect(c.focused).toBe(1);
    expect(c.url).toBe(`${ORIGIN}/body/workout`);
    expect(sw.opened).toEqual([]);
  });

  it("falls back to a new window when the open one cannot be focused", async () => {
    const sw = boot({ clients: [client(`${ORIGIN}/today`, true)] });
    await Promise.all(await sw.emit("notificationclick", tap("/money")));
    expect(sw.opened).toEqual([`${ORIGIN}/money`]);
  });

  it("goes to Today with no url, and never leaves the app", async () => {
    const sw = boot();
    await Promise.all(await sw.emit("notificationclick", tap(undefined)));
    await Promise.all(await sw.emit("notificationclick", tap("https://evil.example/x")));
    expect(sw.opened).toEqual([`${ORIGIN}/today`, `${ORIGIN}/today`]);
  });
});

describe("service worker: local schedule", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  const NOW = Date.parse("2026-10-06T16:00:00Z");
  const item = (key: string, inMinutes: number) => ({ key: `2026-10-06:${key}`, title: key, body: "", url: "/today", at: NOW + inMinutes * 60_000 });
  const post = (sw: ReturnType<typeof boot>, items: unknown[], now = NOW) => sw.emit("message", { data: { type: "lockin:schedule", items, now } });
  const flush = () => vi.advanceTimersByTimeAsync(0);

  it("shows what just came due, holds the rest on timers, and drops what is stale", async () => {
    const sw = boot();
    await post(sw, [item("stale", -30), item("just", -2), item("soon", 3), item("later", 90)]);
    await flush();
    expect(sw.shown.map((s) => s.title)).toEqual(["just"]);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(sw.shown.map((s) => s.title)).toEqual(["just", "soon"]);
    await vi.advanceTimersByTimeAsync(90 * 60_000);
    expect(sw.shown.map((s) => s.title)).toEqual(["just", "soon", "later"]);
  });

  it("does not show a reminder twice when the app posts the list again", async () => {
    const sw = boot();
    await post(sw, [item("just", -1)]);
    await flush();
    await post(sw, [item("just", -1)], NOW + 30_000);
    await flush();
    expect(sw.shown).toHaveLength(1);
  });

  it("replaces timers on every post, so a moved or removed reminder does not fire at the old time", async () => {
    const sw = boot();
    await post(sw, [item("delivery", 10), item("checkin", 20)]);
    await flush();
    const moved = { ...item("delivery", 40) };
    await post(sw, [moved]);
    await flush();
    await vi.advanceTimersByTimeAsync(25 * 60_000);
    expect(sw.shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(sw.shown.map((s) => s.title)).toEqual(["delivery"]);
  });

  it("does not show locally what a push already delivered", async () => {
    const sw = boot();
    await Promise.all(await sw.emit("push", { data: pushData({ title: "Wake", tag: "2026-10-06:wake" }) }));
    await post(sw, [item("wake", -1)]);
    await flush();
    expect(sw.shown).toHaveLength(1);
  });

  it("stops everything on clear", async () => {
    const sw = boot();
    await post(sw, [item("soon", 3)]);
    await flush();
    await sw.emit("message", { data: { type: "lockin:clear" } });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(sw.shown).toEqual([]);
  });

  it("forgets shown keys from other days", async () => {
    const sw = boot();
    sw.store.set("/__reminder_shown/" + encodeURIComponent("2026-10-01:wake"), {});
    await post(sw, [item("soon", 3)]);
    await flush();
    expect([...sw.store.keys()]).toEqual([]);
  });

  it("hands future reminders to notification triggers where the browser has them", async () => {
    const sw = boot({ triggers: true });
    await post(sw, [item("soon", 3)]);
    await flush();
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].options.showTrigger).toMatchObject({ timestamp: NOW + 3 * 60_000 });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(sw.shown).toHaveLength(1);
  });

  it("shows a one off for the local test button and answers the version ping", async () => {
    const sw = boot();
    await Promise.all(await sw.emit("message", { data: { type: "lockin:show", item: { title: "Lock In", body: "Test", url: "/reminders", tag: "lockin-test" } } }));
    expect(sw.shown[0].options).toMatchObject({ body: "Test", tag: "lockin-test", data: { url: "/reminders" } });
    const source = { postMessage: vi.fn() };
    await sw.emit("message", { data: "version", source });
    expect(source.postMessage).toHaveBeenCalledWith({ version: "2" });
  });
});
