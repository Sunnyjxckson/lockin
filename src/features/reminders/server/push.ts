// Sending one web push. Server only.

import type { Agent } from "node:https";
import webpush from "web-push";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What the service worker reads. `tag` doubles as the dedupe key on the device. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface SendOutcome {
  ok: boolean;
  /** The push service says this subscription no longer exists (404 or 410). Delete it. */
  gone: boolean;
  status: number;
  error?: string;
}

export type Sender = (target: PushTarget, payload: PushPayload) => Promise<SendOutcome>;

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** The VAPID settings, or the names of what is missing. */
export function vapidConfig(env: Record<string, string | undefined> = process.env): { config: VapidConfig | null; missing: string[] } {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  const missing: string[] = [];
  if (!publicKey) missing.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  if (!privateKey) missing.push("VAPID_PRIVATE_KEY");
  if (!subject) missing.push("VAPID_SUBJECT");
  return { config: missing.length ? null : { publicKey, privateKey, subject }, missing };
}

/** Seconds the push service keeps an undelivered reminder. After that it is stale, so let it drop. */
export const PUSH_TTL_SECONDS = 20 * 60;

export function makeSender(config: VapidConfig, opts: { agent?: Agent; ttl?: number } = {}): Sender {
  return async (target, payload) => {
    try {
      const res = await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { vapidDetails: config, TTL: opts.ttl ?? PUSH_TTL_SECONDS, urgency: "high", timeout: 10_000, agent: opts.agent },
      );
      return { ok: true, gone: false, status: res.statusCode };
    } catch (e) {
      const status = typeof (e as { statusCode?: unknown }).statusCode === "number" ? (e as { statusCode: number }).statusCode : 0;
      return { ok: false, gone: status === 404 || status === 410, status, error: e instanceof Error ? e.message : String(e) };
    }
  };
}

/** Shape check for a subscription sent up from the browser. */
export function parseSubscription(input: unknown): PushTarget | null {
  if (!input || typeof input !== "object") return null;
  const s = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof s.endpoint !== "string" || !/^https:\/\//.test(s.endpoint)) return null;
  if (!s.keys || typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string") return null;
  if (!s.keys.p256dh || !s.keys.auth) return null;
  return { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth };
}
