"use client";

// Browser side of reminders: what this device can do, turning push on and
// off, and talking to the service worker.

import { isIOS, isStandalone } from "@/lib/install";
import type { PlannedNotification } from "@/lib/logic/reminders";

export { isIOS, isStandalone };

export const VAPID_PUBLIC_KEY = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();

export type Permission = "granted" | "denied" | "default";

export interface DeviceState {
  /** Notifications and a service worker exist here at all. */
  supported: boolean;
  /** PushManager exists, so server push can reach this device. */
  pushSupported: boolean;
  permission: Permission;
  ios: boolean;
  /** Running from the Home Screen (or as an installed app). */
  standalone: boolean;
  /** iPhone or iPad in a browser tab: push cannot work until the app is installed. */
  needsInstall: boolean;
}

export function readDevice(): DeviceState {
  if (typeof window === "undefined") {
    return { supported: false, pushSupported: false, permission: "default", ios: false, standalone: false, needsInstall: false };
  }
  const ios = isIOS();
  const standalone = isStandalone();
  const supported = "Notification" in window && "serviceWorker" in navigator;
  return {
    supported,
    pushSupported: supported && "PushManager" in window,
    permission: supported ? (Notification.permission as Permission) : "default",
    ios,
    standalone,
    needsInstall: ios && !standalone,
  };
}

/** The app's service worker registration, once it is active. Null when there is none. */
export async function registration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const ready = navigator.serviceWorker.ready;
    const timeout = new Promise<null>((r) => window.setTimeout(() => r(null), timeoutMs));
    return await Promise.race([ready, timeout]);
  } catch {
    return null;
  }
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  if (!reg || !("pushManager" in reg)) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function post(path: string, method: "POST" | "DELETE", body: unknown): Promise<Response> {
  return fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

/** Tell the server about a subscription. Safe to call again and again. */
export async function saveSubscription(sub: PushSubscription): Promise<boolean> {
  try {
    const res = await post("/api/reminders/subscribe", "POST", { subscription: sub.toJSON(), user_agent: navigator.userAgent });
    if (!res.ok) return false;
    return ((await res.json()) as { stored?: boolean }).stored === true;
  } catch {
    return false;
  }
}

export interface EnableResult {
  permission: Permission;
  subscription: PushSubscription | null;
  /** The server kept the subscription (Supabase mode). */
  stored: boolean;
  /** Why push could not be set up, in words for the screen. Null when it worked or was not tried. */
  problem: string | null;
}

/**
 * Ask for permission, then subscribe this device when there is a VAPID key.
 * Must be called from a tap.
 */
export async function enable(): Promise<EnableResult> {
  const out: EnableResult = { permission: "default", subscription: null, stored: false, problem: null };
  if (!("Notification" in window)) return { ...out, problem: "This browser has no notifications." };
  out.permission = (await Notification.requestPermission()) as Permission;
  if (out.permission !== "granted") return out;
  if (!VAPID_PUBLIC_KEY) return out;

  const reg = await registration();
  if (!reg || !("pushManager" in reg)) return { ...out, problem: "This browser cannot receive push. Reminders will only show while the app is open." };
  try {
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with an older key cannot be sent to. Start over.
    const wanted = keyBytes(VAPID_PUBLIC_KEY);
    const had = sub?.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    if (sub && had && (had.length !== wanted.length || had.some((b, i) => b !== wanted[i]))) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
    out.subscription = sub;
    out.stored = await saveSubscription(sub);
  } catch (e) {
    out.problem = `Could not subscribe this device. ${e instanceof Error ? e.message : ""}`.trim();
  }
  return out;
}

/** Stop push on this device and tell the server. */
export async function disable(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } finally {
    await post("/api/reminders/subscribe", "DELETE", { endpoint }).catch(() => null);
  }
}

// ---------- service worker messages ----------

async function tell(message: unknown): Promise<boolean> {
  const reg = await registration();
  const worker = reg?.active;
  if (!worker) return false;
  worker.postMessage(message);
  return true;
}

/** Hand today's list to the service worker for the while-open fallback. */
export function postSchedule(plan: readonly PlannedNotification[], now: Date): Promise<boolean> {
  return tell({
    type: "lockin:schedule",
    now: now.getTime(),
    items: plan.map((n) => ({ key: n.key, tag: n.key, title: n.title, body: n.body, url: n.url, at: n.at })),
  });
}

export function clearSchedule(): Promise<boolean> {
  return tell({ type: "lockin:clear" });
}

/** Show one notification right now, from this device alone. */
export function showLocalTest(): Promise<boolean> {
  return tell({
    type: "lockin:show",
    item: { title: "Lock In", body: "Test reminder. This one came from the app on this device.", url: "/reminders", tag: "lockin-test" },
  });
}

export interface ServerStatus {
  vapid: boolean;
  missing: string[];
  supabase: boolean;
  cron_secret: boolean;
  subscriptions: number | null;
  last_run: string | null;
  problem: string | null;
}

export async function fetchStatus(): Promise<ServerStatus | null> {
  try {
    const res = await fetch("/api/reminders/status", { cache: "no-store" });
    return res.ok ? ((await res.json()) as ServerStatus) : null;
  } catch {
    return null;
  }
}

export async function sendServerTest(sub: PushSubscription): Promise<{ ok: boolean; error?: string; gone?: boolean }> {
  try {
    const res = await post("/api/reminders/test", "POST", { subscription: sub.toJSON() });
    return (await res.json()) as { ok: boolean; error?: string; gone?: boolean };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}
