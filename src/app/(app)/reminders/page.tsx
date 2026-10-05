"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bell, BellOff, BellRing, Check, MoonStar, PlusSquare, Send, Share, X } from "lucide-react";
import { Button, Card, EmptyState, List, ListRow, PageHeader, Screen, Section, cn, useToast } from "@/components/ui";
import { useNow, useSettings } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { formatTime, nyParts } from "@/lib/logic/dates";
import { upcoming, type PlannedNotification } from "@/lib/logic/reminders";
import {
  VAPID_PUBLIC_KEY,
  currentSubscription,
  disable,
  enable,
  fetchStatus,
  readDevice,
  saveSubscription,
  sendServerTest,
  showLocalTest,
  type DeviceState,
  type ServerStatus,
} from "@/features/reminders/client";
import { LocalScheduler } from "@/features/reminders/LocalScheduler";
import { useTodayPlan } from "@/features/reminders/usePlan";

type Mode = "loading" | "install" | "unsupported" | "blocked" | "off" | "open-only" | "push";

function money(n: number): string {
  const r = Math.round(n * 100) / 100;
  return `$${Number.isInteger(r) ? r : r.toFixed(2)}`;
}

function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex min-h-[60px] items-center gap-3.5 px-4 py-3">
      <span className="tile flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-medium text-ink">{n}</span>
      <span className="min-w-0 flex-1 text-[15px] text-ink">{children}</span>
      <span className="shrink-0 text-ink-2">{icon}</span>
    </li>
  );
}

function EnvRow({ name, set, note }: { name: string; set: boolean; note?: string }) {
  return (
    <div className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", set ? "grad" : "tile text-ink-2")}>
        {set ? <Check size={13} strokeWidth={2.25} aria-hidden /> : <X size={13} strokeWidth={1.75} aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[12px] text-ink">{name}</span>
        {note ? <span className="t-caption mt-0.5 block truncate text-ink-2">{note}</span> : null}
      </span>
      <span className="t-label shrink-0">{set ? "Set" : "Missing"}</span>
    </div>
  );
}

function ReminderLine({ n, note }: { n: PlannedNotification; note?: string }) {
  const [clock, half] = formatTime(n.time).split(" ");
  return (
    <div className="flex min-h-[64px] items-center gap-4 py-3">
      <span className="flex w-[84px] shrink-0 items-baseline gap-1">
        <span className="t-value text-ink">{clock}</span>
        <span className="t-caption text-ink-2">{half}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">{n.title}</span>
        <span className="t-caption mt-0.5 block truncate text-ink-2">{note ?? n.body}</span>
      </span>
    </div>
  );
}

export default function RemindersPage() {
  const toast = useToast();
  const now = useNow(30_000);
  const settings = useSettings();
  const today = useTodayPlan();

  const [device, setDevice] = useState<DeviceState | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState<"enable" | "test" | "disable" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const d = readDevice();
    setDevice(d);
    const [s, existing] = await Promise.all([fetchStatus(), d.pushSupported ? currentSubscription() : Promise.resolve(null)]);
    setStatus(s);
    setStatusLoaded(true);
    setSub(existing);
    // Keep the server's copy in step. The browser can swap a subscription on its own.
    if (existing && d.permission === "granted" && VAPID_PUBLIC_KEY) void saveSubscription(existing);
  }, []);

  useEffect(() => {
    // Reads what this device and the server can do, then stores it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const again = () => void refresh();
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [refresh]);

  const hasKey = !!VAPID_PUBLIC_KEY;
  const serverReady = !!status && status.supabase && status.vapid && status.cron_secret && hasKey;

  let mode: Mode = "loading";
  if (device && statusLoaded) {
    if (device.needsInstall) mode = "install";
    else if (!device.supported) mode = "unsupported";
    else if (device.permission === "denied") mode = "blocked";
    else if (device.permission === "default") mode = "off";
    else mode = serverReady && sub ? "push" : "open-only";
  }

  async function onEnable() {
    setBusy("enable");
    setProblem(null);
    try {
      const res = await enable();
      setSub(res.subscription);
      setProblem(res.problem);
      window.dispatchEvent(new Event("lockin:reminders-permission"));
      if (res.permission === "granted") {
        haptics.done();
        toast("Notifications are on", { kind: "done" });
      } else if (res.permission === "denied") {
        haptics.error();
      }
    } finally {
      await refresh();
      setBusy(null);
    }
  }

  async function onTest() {
    setBusy("test");
    try {
      if (sub && status?.vapid && hasKey) {
        const res = await sendServerTest(sub);
        if (res.ok) toast("Test sent. It should land in a few seconds.", { kind: "done" });
        else {
          toast(res.error ?? "The test did not send.", { kind: "error", duration: 6000 });
          if (res.gone) {
            // The push service dropped it. Clear it here so the device can subscribe fresh.
            await disable();
            await refresh();
          }
        }
      } else if (await showLocalTest()) {
        toast("Test shown from this device", { kind: "done" });
      } else {
        toast("The app is still getting ready. Try again in a moment.", { kind: "error" });
      }
    } finally {
      setBusy(null);
    }
  }

  async function onDisable() {
    setBusy("disable");
    try {
      await disable();
      toast("Push is off on this device");
    } finally {
      await refresh();
      setBusy(null);
    }
  }

  const list = today.loading ? [] : upcoming(today.plan, now);
  const passed = today.plan.length - list.length;
  const quiet = settings.data ? `${formatTime(settings.data.quiet_start)} to ${formatTime(settings.data.quiet_end)}` : null;
  const lastRun = status?.last_run ? formatTime(nyParts(status.last_run).time) : null;

  const HERO: Record<Exclude<Mode, "loading">, { word: string; line: string; done?: boolean }> = {
    install: { word: "Add to Home Screen", line: "On iPhone, reminders only reach an app on the Home Screen." },
    unsupported: { word: "Not available", line: "This browser has no notifications. Use Safari or Chrome." },
    blocked: {
      word: "Blocked",
      line: device?.ios ? "Allow them in Settings, Notifications, Lock In." : "Allow them in the browser's site settings, then come back.",
    },
    off: { word: "Off", line: "Wake, workout, delivery and check-in reminders, on this device." },
    "open-only": { word: "On while open", line: "With the app closed they can be missed." },
    push: { word: "On", line: "Reminders arrive even when Lock In is closed.", done: true },
  };
  const hero = mode === "loading" ? null : HERO[mode];

  return (
    <Screen>
      <LocalScheduler />
      <PageHeader title="Reminders" back="/settings" />

      <div className="animate-fade-in min-h-[128px] px-1 pt-2">
        {hero ? (
          <>
            <p className="t-label flex items-center gap-2">
              {hero.done ? <span className="grad-line size-1.5 rounded-full" aria-hidden /> : null}
              This device
            </p>
            <p className={cn("t-greeting mt-2.5", hero.done && "text-accent")}>{hero.word}</p>
            <p className="t-sub mt-3">{hero.line}</p>
            {problem ? <p className="mt-2 text-[13px] text-warn">{problem}</p> : null}
          </>
        ) : null}
      </div>

      {mode === "off" ? (
        <Button className="mt-5" full size="lg" loading={busy === "enable"} icon={<Bell size={18} strokeWidth={1.75} aria-hidden />} onClick={onEnable}>
          Turn on notifications
        </Button>
      ) : null}

      {mode === "open-only" || mode === "push" ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Button variant="secondary" loading={busy === "test"} icon={<Send size={18} strokeWidth={1.75} aria-hidden />} onClick={onTest}>
            Send test
          </Button>
          {mode === "open-only" && hasKey && device?.pushSupported && !sub ? (
            <Button variant="ghost" loading={busy === "enable"} onClick={onEnable}>
              Subscribe this device
            </Button>
          ) : null}
          {sub ? (
            <Button variant="ghost" loading={busy === "disable"} onClick={onDisable}>
              Turn off push
            </Button>
          ) : null}
        </div>
      ) : null}

      {mode === "install" ? (
        <Section title="Three taps">
          <Card padded={false} className="overflow-hidden">
            <ol className="divide-y divide-hair">
              <Step n={1} icon={<Share size={20} strokeWidth={1.75} aria-hidden />}>
                In Safari, tap <span className="font-medium">Share</span>
              </Step>
              <Step n={2} icon={<PlusSquare size={20} strokeWidth={1.75} aria-hidden />}>
                Tap <span className="font-medium">Add to Home Screen</span>
              </Step>
              <Step n={3} icon={<Bell size={20} strokeWidth={1.75} aria-hidden />}>
                Open Lock In from the new icon and come back here
              </Step>
            </ol>
          </Card>
          <p className="t-sub mt-3 px-1">Needs iOS 16.4 or later.</p>
        </Section>
      ) : null}

      <Section title="Still to come today" right={!today.loading && passed > 0 ? `${passed} earlier` : undefined}>
        {today.loading ? (
          <div className="h-[128px]" aria-hidden />
        ) : list.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              compact
              icon={today.enabledCount === 0 ? <BellOff size={22} strokeWidth={1.75} aria-hidden /> : <MoonStar size={22} strokeWidth={1.75} aria-hidden />}
              title={today.enabledCount === 0 ? "Every reminder is off" : today.plan.length === 0 ? "Nothing planned today" : "Nothing left today"}
              body={
                today.enabledCount === 0
                  ? "Switch them back on in Settings."
                  : today.plan.length === 0
                    ? "No reminder falls outside quiet hours today."
                    : "The next one is tomorrow's first reminder."
              }
            />
          </Card>
        ) : (
          <List label="Still to come today">
            {list.map((n) => (
              <ReminderLine
                key={n.key}
                n={n}
                note={
                  n.kind === "earnings_nudge"
                    ? today.earned >= today.floor
                      ? `Skipped. ${money(today.earned)} is at or over the ${money(today.floor)} floor.`
                      : `Only if still under ${money(today.floor)}. ${money(today.earned)} so far.`
                    : undefined
                }
              />
            ))}
          </List>
        )}
        {quiet ? <p className="t-sub mt-3 px-1">Quiet from {quiet}.</p> : null}
      </Section>

      <Section title="When the app is closed" right={statusLoaded ? (serverReady ? "Set up" : "Not set up") : undefined}>
        {!statusLoaded ? (
          <div className="h-[120px]" aria-hidden />
        ) : serverReady ? (
          <div className="tile rounded-[20px] px-4 py-3">
            <p className="t-sub">
              {status?.subscriptions !== null && status?.subscriptions !== undefined ? `${status.subscriptions} ${status.subscriptions === 1 ? "device" : "devices"} subscribed. ` : ""}
              {lastRun ? `Last check at ${lastRun}.` : "The job has not run yet. Check the scheduler."}
            </p>
            {status?.problem ? <p className="mt-2 text-[13px] text-warn">{status.problem}</p> : null}
          </div>
        ) : (
          <>
            <Card padded={false} className="overflow-hidden">
              <div className="divide-y divide-hair">
                <EnvRow name="NEXT_PUBLIC_SUPABASE_URL" set={!!status?.supabase} note="With SUPABASE_SERVICE_ROLE_KEY" />
                <EnvRow name="NEXT_PUBLIC_VAPID_PUBLIC_KEY" set={hasKey && !status?.missing.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY")} note="npx web-push generate-vapid-keys" />
                <EnvRow name="VAPID_PRIVATE_KEY" set={!!status && !status.missing.includes("VAPID_PRIVATE_KEY")} note="The other half of the pair" />
                <EnvRow name="VAPID_SUBJECT" set={!!status && !status.missing.includes("VAPID_SUBJECT")} note="mailto:you@example.com" />
                <EnvRow name="CRON_SECRET" set={!!status?.cron_secret} note="Any long random string" />
              </div>
            </Card>
            <p className="t-sub mt-3 px-1">Set these on the server and redeploy. Until then reminders only show while Lock In is open.</p>
          </>
        )}
      </Section>

      <Section title="Change them">
        <Card padded={false} className="overflow-hidden">
          <ListRow href="/settings/reminders" left={<BellRing size={20} strokeWidth={1.75} aria-hidden />} title="Times and on or off" sub="Each reminder, and quiet hours" />
        </Card>
      </Section>
    </Screen>
  );
}
