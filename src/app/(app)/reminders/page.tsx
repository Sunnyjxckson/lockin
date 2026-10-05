"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bell, BellOff, BellRing, Check, MoonStar, PlusSquare, Send, Share, Smartphone, X } from "lucide-react";
import { Button, Card, EmptyState, ListRow, PageHeader, Screen, Section, cn, useToast } from "@/components/ui";
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
    <li className="flex items-center gap-3 px-4 py-3.5">
      <span className="tnum flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[15px] font-semibold text-ink">{n}</span>
      <span className="min-w-0 flex-1 text-[16px] text-ink">{children}</span>
      <span className="shrink-0 text-ink-3">{icon}</span>
    </li>
  );
}

function EnvRow({ name, set, note }: { name: string; set: boolean; note?: string }) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          set ? "bg-accent-soft text-accent" : "bg-surface-3 text-ink-3",
        )}
      >
        {set ? <Check size={14} strokeWidth={3} aria-hidden /> : <X size={14} strokeWidth={2.5} aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[13px] text-ink">{name}</span>
        {note ? <span className="block truncate text-[12px] text-ink-3">{note}</span> : null}
      </span>
      <span className={cn("shrink-0 text-[13px]", set ? "text-ink-2" : "text-ink-3")}>{set ? "Set" : "Missing"}</span>
    </div>
  );
}

function ReminderLine({ n, note }: { n: PlannedNotification; note?: string }) {
  const [clock, half] = formatTime(n.time).split(" ");
  return (
    <div className="flex min-h-[64px] items-center gap-4 px-4 py-3">
      <span className="w-[78px] shrink-0">
        <span className="tnum text-[22px] font-semibold leading-none tracking-tight text-ink">{clock}</span>
        <span className="ml-1 text-[12px] font-medium text-ink-3">{half}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-medium text-ink">{n.title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-ink-3">{note ?? n.body}</span>
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

  const HERO: Record<Exclude<Mode, "loading">, { icon: ReactNode; word: string; line: string; done?: boolean }> = {
    install: {
      icon: <Smartphone size={26} aria-hidden />,
      word: "Add to Home Screen",
      line: "On iPhone, notifications only work once Lock In is on your Home Screen. It takes three taps.",
    },
    unsupported: {
      icon: <BellOff size={26} aria-hidden />,
      word: "Not available",
      line: "This browser has no notifications. Open Lock In in Safari or Chrome.",
    },
    blocked: {
      icon: <BellOff size={26} aria-hidden />,
      word: "Blocked",
      line: device?.ios
        ? "Notifications are turned off for Lock In. Open the Settings app, then Notifications, then Lock In, and allow them."
        : "Notifications are blocked for this site. Allow them in the browser's site settings, then come back.",
    },
    off: {
      icon: <Bell size={26} aria-hidden />,
      word: "Off",
      line: "Turn notifications on to get wake, workout, delivery and check-in reminders on this device.",
    },
    "open-only": {
      icon: <BellRing size={26} aria-hidden />,
      word: "On while open",
      line: "Reminders show while Lock In is open or was just put away. With the app closed they can be missed.",
    },
    push: {
      icon: <BellRing size={26} aria-hidden />,
      word: "On",
      line: "This device gets reminders even when Lock In is closed.",
      done: true,
    },
  };
  const hero = mode === "loading" ? null : HERO[mode];

  return (
    <Screen>
      <LocalScheduler />
      <PageHeader title="Reminders" back="/settings" />

      <Card className="mt-2 animate-fade-in">
        {hero ? (
          <>
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "flex size-14 shrink-0 items-center justify-center rounded-full border",
                  hero.done ? "border-accent-line bg-accent-soft text-accent" : "border-line bg-surface-2 text-ink-2",
                )}
              >
                {hero.icon}
              </span>
              <div className="min-w-0">
                <p className="t-label">This device</p>
                <p className={cn("mt-1 text-[28px] font-semibold leading-[1.1] tracking-tight", hero.done ? "text-accent" : "text-ink")}>{hero.word}</p>
              </div>
            </div>
            <p className="t-sub mt-4">{hero.line}</p>
            {problem ? <p className="mt-3 text-[14px] text-warn">{problem}</p> : null}

            {mode === "off" ? (
              <Button className="mt-5" full size="lg" loading={busy === "enable"} icon={<Bell size={18} aria-hidden />} onClick={onEnable}>
                Turn on notifications
              </Button>
            ) : null}

            {mode === "open-only" || mode === "push" ? (
              <div className="mt-5 flex flex-col gap-2">
                <Button full size="lg" variant="secondary" loading={busy === "test"} icon={<Send size={18} aria-hidden />} onClick={onTest}>
                  Send test
                </Button>
                {mode === "open-only" && hasKey && device?.pushSupported && !sub ? (
                  <Button full variant="ghost" loading={busy === "enable"} onClick={onEnable}>
                    Subscribe this device
                  </Button>
                ) : null}
                {sub ? (
                  <Button full variant="ghost" loading={busy === "disable"} onClick={onDisable}>
                    Turn off push on this device
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="h-[132px]" aria-hidden />
        )}
      </Card>

      {mode === "install" ? (
        <Section title="Add to Home Screen">
          <Card padded={false} className="overflow-hidden">
            <ol className="divide-y divide-line">
              <Step n={1} icon={<Share size={20} aria-hidden />}>
                In Safari, tap <span className="font-semibold">Share</span>
              </Step>
              <Step n={2} icon={<PlusSquare size={20} aria-hidden />}>
                Tap <span className="font-semibold">Add to Home Screen</span>
              </Step>
              <Step n={3} icon={<Bell size={20} aria-hidden />}>
                Open Lock In from the new icon, come back here, and turn notifications on
              </Step>
            </ol>
          </Card>
          <p className="t-sub mt-3 px-1">Needs iOS 16.4 or later. Reminders cannot reach a Safari tab.</p>
        </Section>
      ) : null}

      <Section title="Still to come today" right={!today.loading && passed > 0 ? <span className="t-sub">{passed} earlier</span> : undefined}>
        {today.loading ? (
          <Card className="h-[128px]" aria-hidden />
        ) : list.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              compact
              icon={today.enabledCount === 0 ? <BellOff size={24} aria-hidden /> : <MoonStar size={24} aria-hidden />}
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
          <Card padded={false} className="overflow-hidden">
            <div className="divide-y divide-line">
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
            </div>
          </Card>
        )}
        {quiet ? <p className="t-sub mt-3 px-1">Quiet from {quiet}. Nothing is sent then.</p> : null}
      </Section>

      <Section title="When the app is closed">
        {!statusLoaded ? (
          <Card className="h-[120px]" aria-hidden />
        ) : serverReady ? (
          <Card>
            <p className="text-[16px] font-medium text-ink">Server push is set up</p>
            <p className="t-sub mt-1.5">
              A job checks every few minutes and sends what is due to each subscribed device.
              {status?.subscriptions !== null && status?.subscriptions !== undefined
                ? ` ${status.subscriptions} ${status.subscriptions === 1 ? "device is" : "devices are"} subscribed.`
                : ""}
              {lastRun ? ` Last check at ${lastRun}.` : " It has not run yet. Check that the scheduler is calling it."}
            </p>
            {status?.problem ? <p className="mt-3 text-[14px] text-warn">{status.problem}</p> : null}
          </Card>
        ) : (
          <>
            <Card>
              <p className="text-[16px] font-medium text-ink">Not set up</p>
              <p className="t-sub mt-1.5">
                Reliable reminders when the app is closed need Supabase mode plus VAPID keys. Until then they only show while Lock In is open or recently
                in the background.
              </p>
            </Card>
            <Card padded={false} className="mt-3 overflow-hidden">
              <div className="divide-y divide-line">
                <EnvRow name="NEXT_PUBLIC_SUPABASE_URL" set={!!status?.supabase} note="With SUPABASE_SERVICE_ROLE_KEY. Data moves to the server" />
                <EnvRow name="NEXT_PUBLIC_VAPID_PUBLIC_KEY" set={hasKey && !status?.missing.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY")} note="npx web-push generate-vapid-keys" />
                <EnvRow name="VAPID_PRIVATE_KEY" set={!!status && !status.missing.includes("VAPID_PRIVATE_KEY")} note="The other half of the pair" />
                <EnvRow name="VAPID_SUBJECT" set={!!status && !status.missing.includes("VAPID_SUBJECT")} note="mailto:you@example.com" />
                <EnvRow name="CRON_SECRET" set={!!status?.cron_secret} note="Any long random string" />
              </div>
            </Card>
            <p className="t-sub mt-3 px-1">Set these on the server and redeploy. Steps are in the README.</p>
          </>
        )}
      </Section>

      <Section title="Change them">
        <Card padded={false} className="overflow-hidden">
          <ListRow href="/settings/reminders" left={<BellRing size={20} aria-hidden />} title="Times and on or off" sub="Each reminder, and quiet hours" />
        </Card>
      </Section>
    </Screen>
  );
}
