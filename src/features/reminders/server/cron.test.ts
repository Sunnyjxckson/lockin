// The reminder job from end to end, short of a real push service: a real
// web-push send (VAPID signed, encrypted) to a local HTTPS server standing in
// for the push service, which decrypts the body the way a browser would.

import { execSync } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import webpush from "web-push";
import { nyInstant } from "@/lib/logic/dates";
import type { Reminder } from "@/lib/types";
import { runCron, type CronData, type CronDeps } from "./cron";
import { makeSender, parseSubscription, vapidConfig, type PushTarget } from "./push";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require("http_ece") as { decrypt(buf: Buffer, params: Record<string, unknown>): Buffer };

const b64u = (b: Buffer) => b.toString("base64url");

/** A browser's side of a subscription: keys it holds, and what it hands the server. */
function device(endpoint: string) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const target: PushTarget = { endpoint, p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) };
  const open = (body: Buffer) => JSON.parse(ece.decrypt(body, { version: "aes128gcm", privateKey: ecdh, authSecret: auth }).toString("utf8"));
  return { target, open };
}

interface Hit {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

let server: https.Server;
let base = "";
let hits: Hit[] = [];
/** Path to status code the fake push service answers with. Default 201. */
let answers: Record<string, number> = {};
const agent = new https.Agent({ rejectUnauthorized: false });
const vapid = webpush.generateVAPIDKeys();
const send = makeSender({ ...vapid, subject: "mailto:test@example.com" }, { agent });

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "lockin-push-"));
  execSync(
    `openssl req -x509 -newkey rsa:2048 -nodes -keyout ${dir}/k.pem -out ${dir}/c.pem -days 1 -subj "/CN=localhost"`,
    { stdio: "ignore" },
  );
  server = https.createServer({ key: readFileSync(`${dir}/k.pem`), cert: readFileSync(`${dir}/c.pem`) }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const path = req.url ?? "";
      hits.push({ path, headers: req.headers, body: Buffer.concat(chunks) });
      res.statusCode = answers[path] ?? 201;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `https://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  agent.destroy();
  server?.close();
});

beforeEach(() => {
  hits = [];
  answers = {};
});

function rem(p: Partial<Reminder> & Pick<Reminder, "id" | "kind">): Reminder {
  return { created_at: "", label: p.kind, body: null, time: null, block_name: null, item_id: null, offset_minutes: 0, enabled: true, sort_order: 0, ...p };
}

const D = "2026-10-06";
const REMINDERS = [
  rem({ id: "wake", kind: "wake", label: "Wake", body: "Feet on the floor.", time: "05:45" }),
  rem({ id: "del", kind: "delivery", label: "Delivery block", block_name: "Delivery", offset_minutes: -10 }),
  rem({ id: "nudge", kind: "earnings_nudge", label: "Earnings nudge", body: "Get back out.", time: "20:00" }),
];

/** An in-memory stand in for the Supabase tables the job uses. */
function world(subs: PushTarget[]) {
  const state = {
    subs: subs.slice(),
    sent: new Map<string, string>(),
    lastRun: null as Date | null,
    earned: 0,
    blocks: [{ id: "template:t1", template_id: "t1", block_name: "Delivery: dinner", start: "17:00" }],
  };
  const deps = (now: Date): CronDeps => ({
    now,
    send,
    loadData: async (dates): Promise<CronData> => ({
      reminders: REMINDERS,
      floor: 100,
      quiet_start: "23:00",
      quiet_end: "05:30",
      days: dates.map((date) => ({ date, blocks: state.blocks, earned: state.earned })),
    }),
    getLastRun: async () => state.lastRun,
    setLastRun: async (at) => void (state.lastRun = at),
    sentKeys: async (dates) => [...state.sent].filter(([, d]) => dates.includes(d)).map(([k]) => k),
    claim: async (date, key) => {
      if (state.sent.has(key)) return false;
      state.sent.set(key, date);
      return true;
    },
    forget: async (before) => {
      for (const [k, d] of state.sent) if (d < before) state.sent.delete(k);
    },
    listSubscriptions: async () => state.subs.slice(),
    removeSubscription: async (endpoint) => void (state.subs = state.subs.filter((s) => s.endpoint !== endpoint)),
  });
  return { state, run: (time: string, date = D) => runCron(deps(nyInstant(date, time))) };
}

describe("reminder job", () => {
  it("sends a due reminder as a real encrypted, VAPID signed push the device can read", async () => {
    const phone = device(`${base}/push/phone`);
    const w = world([phone.target]);

    const first = await w.run("05:40");
    expect(first.due).toBe(0);
    expect(hits).toHaveLength(0);

    const res = await w.run("05:45");
    expect(res.sent).toEqual([{ key: `${D}:wake`, delivered: 1, failed: 0 }]);
    expect(hits).toHaveLength(1);
    const hit = hits[0];
    expect(hit.path).toBe("/push/phone");
    expect(hit.headers["content-encoding"]).toBe("aes128gcm");
    expect(String(hit.headers.authorization)).toMatch(/^vapid t=.+, k=/);
    expect(hit.headers.ttl).toBe("1200");
    expect(hit.headers.urgency).toBe("high");
    expect(phone.open(hit.body)).toEqual({ title: "Wake", body: "Feet on the floor.", url: "/today", tag: `${D}:wake` });
  });

  it("does not send the same reminder twice across runs, or when the last run is lost", async () => {
    const phone = device(`${base}/push/phone`);
    const w = world([phone.target]);
    await w.run("05:45");
    await w.run("05:50");
    w.state.lastRun = null; // as if reminder_run were wiped
    await w.run("05:55");
    expect(hits).toHaveLength(1);
  });

  it("sends to every device, prunes one that is gone (410) and keeps one that only failed (500)", async () => {
    const phone = device(`${base}/push/phone`);
    const old = device(`${base}/push/old`);
    const flaky = device(`${base}/push/flaky`);
    answers = { "/push/old": 410, "/push/flaky": 500 };
    const w = world([phone.target, old.target, flaky.target]);

    const res = await w.run("05:45");
    expect(res.sent).toEqual([{ key: `${D}:wake`, delivered: 1, failed: 2 }]);
    expect(res.pruned).toBe(1);
    expect(w.state.subs.map((s) => s.endpoint)).toEqual([`${base}/push/phone`, `${base}/push/flaky`]);
  });

  it("prunes on 404 too", async () => {
    const old = device(`${base}/push/old`);
    answers = { "/push/old": 404 };
    const w = world([old.target]);
    const res = await w.run("05:45");
    expect(res.pruned).toBe(1);
    expect(w.state.subs).toEqual([]);
  });

  it("follows a moved delivery block and reads earnings at send time", async () => {
    const phone = device(`${base}/push/phone`);
    const w = world([phone.target]);
    w.state.lastRun = nyInstant(D, "16:40");
    w.state.blocks = [{ id: "blk-1", template_id: "t1", block_name: "Delivery: dinner", start: "18:00" }];

    await w.run("16:50");
    expect(hits).toHaveLength(0);
    await w.run("17:50");
    expect(phone.open(hits[0].body)).toMatchObject({ title: "Delivery: dinner", body: "Starts in 10 min, at 6:00 PM.", url: "/money" });

    w.state.lastRun = nyInstant(D, "19:55");
    w.state.earned = 60;
    await w.run("20:00");
    expect(phone.open(hits[1].body)).toMatchObject({ title: "Earnings nudge", body: "$60 of $100 today. $40 to go. Get back out.", url: "/money" });
  });

  it("does not nudge once the floor is met", async () => {
    const phone = device(`${base}/push/phone`);
    const w = world([phone.target]);
    w.state.lastRun = nyInstant(D, "19:55");
    w.state.earned = 100;
    const res = await w.run("20:00");
    expect(res.due).toBe(0);
    expect(hits).toHaveLength(0);
  });

  it("records nothing when no device is subscribed, and still moves the window on", async () => {
    const w = world([]);
    const res = await w.run("05:45");
    expect(res.due).toBe(1);
    expect(res.sent).toEqual([]);
    expect(w.state.sent.size).toBe(0);
    expect(w.state.lastRun?.getTime()).toBe(nyInstant(D, "05:45").getTime());
  });

  it("trims old send records", async () => {
    const w = world([]);
    w.state.sent.set("2026-10-01:wake", "2026-10-01");
    w.state.sent.set("2026-10-05:wake", "2026-10-05");
    await w.run("12:00");
    expect([...w.state.sent.keys()]).toEqual(["2026-10-05:wake"]);
  });
});

describe("push config", () => {
  it("names what is missing", () => {
    expect(vapidConfig({}).missing).toEqual(["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]);
    expect(vapidConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", VAPID_SUBJECT: " " }).missing).toEqual(["VAPID_SUBJECT"]);
    expect(vapidConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b", VAPID_SUBJECT: "mailto:x@y.z" }).config).not.toBeNull();
  });

  it("accepts only a well formed https subscription", () => {
    expect(parseSubscription({ endpoint: "https://push.example/x", keys: { p256dh: "p", auth: "a" } })).toEqual({ endpoint: "https://push.example/x", p256dh: "p", auth: "a" });
    expect(parseSubscription({ endpoint: "http://push.example/x", keys: { p256dh: "p", auth: "a" } })).toBeNull();
    expect(parseSubscription({ endpoint: "https://push.example/x", keys: { p256dh: "p" } })).toBeNull();
    expect(parseSubscription(null)).toBeNull();
  });
});
