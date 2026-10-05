// Lock In service worker.
//
// Kept small on purpose. It exists so the app can be installed and so
// reminders have somewhere to land. It does not cache pages, so a new deploy
// is always what the user sees.
//
// Two ways a reminder gets here:
// 1. Server push (Supabase mode with VAPID keys): the "push" event, with a
//    JSON payload { title, body, url, tag }.
// 2. Local fallback: the open app posts today's list ("lockin:schedule") and
//    this worker shows each one when its time comes. Browsers stop an idle
//    worker after a short while, so this only covers the app being open or
//    recently in the background. It is a fallback, not a promise.
//
// Every reminder has a key (also its tag). A key that has been shown is
// remembered in Cache Storage, so the two paths never show the same one twice.
//
// Bump VERSION when this file changes.

const VERSION = "2";
const SHOWN_CACHE = "lockin-reminders-shown";
/** A local reminder this late is dropped instead of shown. Matches the server. */
const GRACE_MS = 20 * 60 * 1000;
/** Timers further out than this are left for the next schedule message. */
const MAX_TIMER_MS = 6 * 60 * 60 * 1000;
const ICON = "/icons/icon-192.png";
const BADGE = "/icons/badge-96.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ---------- shown keys ----------

function shownUrl(key) {
  return "/__reminder_shown/" + encodeURIComponent(key);
}

async function wasShown(key) {
  if (!key) return false;
  try {
    const cache = await caches.open(SHOWN_CACHE);
    return !!(await cache.match(shownUrl(key)));
  } catch {
    return false;
  }
}

async function markShown(key) {
  if (!key) return;
  try {
    const cache = await caches.open(SHOWN_CACHE);
    await cache.put(shownUrl(key), new Response(String(Date.now())));
  } catch {
    // No Cache Storage (private mode). The tag still stops a visible double.
  }
}

/** Forget keys from other days. Keys start with their YYYY-MM-DD date. */
async function trimShown(keepDates) {
  try {
    const cache = await caches.open(SHOWN_CACHE);
    for (const req of await cache.keys()) {
      const key = decodeURIComponent(new URL(req.url).pathname.replace("/__reminder_shown/", ""));
      const date = key.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !keepDates.includes(date)) await cache.delete(req);
    }
  } catch {
    // Nothing to trim.
  }
}

// ---------- showing ----------

function clean(text) {
  // No dash characters in anything shown.
  return String(text || "").replace(/[\u2012-\u2015]/g, ", ").replace(/\s+,/g, ",");
}

function show(item, extra) {
  return self.registration.showNotification(clean(item.title) || "Lock In", {
    body: clean(item.body),
    tag: item.tag || item.key || "lockin",
    icon: ICON,
    badge: BADGE,
    data: { url: item.url || "/today", key: item.key || item.tag || null },
    ...(extra || {}),
  });
}

// ---------- server push ----------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  if (!data || typeof data !== "object") data = { body: String(data) };
  const key = data.tag || null;
  event.waitUntil(
    (async () => {
      // A push must always show something. If the local fallback already
      // showed this one, replace it quietly instead of buzzing again.
      const seen = await wasShown(key);
      await show({ title: data.title, body: data.body, url: data.url, tag: key || "lockin", key }, { renotify: !!key && !seen });
      await markShown(key);
    })(),
  );
});

// ---------- tap ----------

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/today";
  let target;
  try {
    target = new URL(raw, self.location.origin);
    // Only ever open this app.
    if (target.origin !== self.location.origin) target = new URL("/today", self.location.origin);
  } catch {
    target = new URL("/today", self.location.origin);
  }
  const url = target.href;
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of list) {
        if (!("focus" in client)) continue;
        try {
          const focused = await client.focus();
          if (focused && "navigate" in focused && focused.url !== url) await focused.navigate(url);
          return;
        } catch {
          // This window cannot be steered. Try the next, or open a new one.
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// ---------- the push service replaced the subscription ----------

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const old = event.oldSubscription;
        const options = old ? old.options : null;
        if (!options || !options.applicationServerKey) return;
        const fresh =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey }));
        await fetch("/api/reminders/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ subscription: fresh.toJSON(), user_agent: self.navigator ? self.navigator.userAgent : null }),
        });
        if (old && old.endpoint !== fresh.endpoint) {
          await fetch("/api/reminders/subscribe", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ endpoint: old.endpoint }),
          });
        }
      } catch {
        // The app subscribes again the next time the Reminders screen opens.
      }
    })(),
  );
});

// ---------- local fallback ----------

/** key -> { id, release }. release settles the promise handed to waitUntil. */
const timers = new Map();

function clearTimers() {
  for (const t of timers.values()) {
    clearTimeout(t.id);
    t.release();
  }
  timers.clear();
}

function hasTriggers() {
  return typeof self.TimestampTrigger === "function" && typeof Notification !== "undefined" && "showTrigger" in Notification.prototype;
}

async function fire(item) {
  timers.delete(item.key);
  if (await wasShown(item.key)) return;
  await markShown(item.key);
  await show(item, { renotify: true });
}

/**
 * Take today's list from the app. Shows anything that just came due, sets a
 * timer (or a trigger, where the browser has them) for the rest, and drops
 * timers for reminders that are no longer in the list.
 * Returns a promise that settles when the timers close to now have fired.
 */
async function schedule(items, now) {
  clearTimers();
  const list = Array.isArray(items) ? items.filter((i) => i && typeof i.key === "string" && typeof i.at === "number") : [];
  const dates = Array.from(new Set(list.map((i) => i.key.slice(0, 10))));
  if (dates.length) await trimShown(dates);

  const triggers = hasTriggers();
  if (triggers) {
    // Cancel triggers the list no longer has (a moved block, a reminder turned off).
    try {
      const pending = await self.registration.getNotifications({ includeTriggered: true });
      const keys = new Set(list.map((i) => i.key));
      for (const n of pending) {
        if (n.showTrigger && !keys.has(n.tag)) n.close();
      }
    } catch {
      // Older shape of the API. Tags still replace on the next schedule.
    }
  }

  const waits = [];
  for (const item of list) {
    const delay = item.at - now;
    if (delay <= 0) {
      if (delay > -GRACE_MS) waits.push(fire(item));
      continue;
    }
    if (await wasShown(item.key)) continue;
    if (triggers) {
      // The browser holds this one itself, even after the worker stops.
      try {
        await show(item, { showTrigger: new self.TimestampTrigger(item.at), renotify: true });
        continue;
      } catch {
        // Fall through to a timer.
      }
    }
    if (delay > MAX_TIMER_MS) continue;
    const done = new Promise((resolve) => {
      const id = setTimeout(() => {
        fire(item).then(resolve, resolve);
      }, delay);
      timers.set(item.key, { id, release: resolve });
    });
    // Ask the browser to keep the worker alive for timers that are close.
    if (delay <= 5 * 60 * 1000) waits.push(done);
  }
  await Promise.all(waits);
}

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg === "version") {
    if (event.source) event.source.postMessage({ version: VERSION });
    return;
  }
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "lockin:schedule") {
    event.waitUntil(schedule(msg.items, typeof msg.now === "number" ? msg.now : Date.now()));
  } else if (msg.type === "lockin:clear") {
    clearTimers();
  } else if (msg.type === "lockin:show" && msg.item) {
    // A one off, used by the test button when there is no server push.
    event.waitUntil(show(msg.item, { renotify: true }));
  }
});
