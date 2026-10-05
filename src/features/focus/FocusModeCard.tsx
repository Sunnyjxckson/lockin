"use client";

// Strict mode, and the one time walk through for pairing the timer with the
// phone's own blocker. The phone's settings are what actually keep TikTok
// shut. This app only watches and records.

import { useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { Button, Card, ListRow, SegmentedControl, Sheet, Toggle, cn } from "@/components/ui";
import { isIOS } from "@/lib/install";
import { GRACE_OPTIONS, formatAway, type StrictMode } from "@/lib/logic/focus";
import { usePrefText, useStrict } from "./useFocus";

const STRICT: { value: StrictMode; label: string }[] = [
  { value: "off", label: "Record" },
  { value: "end", label: "End it" },
  { value: "void", label: "Void it" },
];
const GRACE = GRACE_OPTIONS.map((s) => ({ value: s as number, label: formatAway(s) }));

const STRICT_COPY: Record<StrictMode, string> = {
  off: "Time away comes off the session. You can claim it back.",
  end: "Gone past the grace period, the session ends where you left.",
  void: "Gone past the grace period, the session is thrown out.",
};

const IPHONE: { title: string; steps: string[] }[] = [
  {
    title: "Make a Focus for studying",
    steps: [
      "Open Settings, then Focus, and add a new Focus. Name it Study.",
      "Choose which people and apps may still notify you. Allow Lock In, leave social apps out.",
      "Turn it on from Control Center when you sit down.",
    ],
  },
  {
    title: "Block the apps themselves",
    steps: [
      "A Focus silences apps but does not stop you opening them. Screen Time does.",
      "Open Settings, then Screen Time, and add an app limit for the social category or for TikTok and the others by name.",
      "Set the limit low so the apps are shut by the time you study, and set a Screen Time passcode that someone else knows if you tend to tap through.",
    ],
  },
  {
    title: "Open Lock In when the Focus turns on",
    steps: [
      "Open the Shortcuts app, go to Automation, and create a new personal automation.",
      "Pick your Study Focus as the trigger and choose When Turning On.",
      "Add the action that opens an app, choose Lock In, and save. Turning the Focus on now lands you on the timer.",
    ],
  },
];

const ANDROID: { title: string; steps: string[] }[] = [
  {
    title: "Turn on Focus mode",
    steps: [
      "Open Settings, then Digital Wellbeing, then Focus mode.",
      "Choose the apps to pause: TikTok, Instagram and anything else that pulls you. While Focus mode is on you cannot open them and they send nothing.",
      "Tap Turn on now when you sit down, or Set a schedule to match your study block.",
    ],
  },
  {
    title: "Cap the worst ones all day",
    steps: ["In Digital Wellbeing open App timers, tap the timer next to an app and pick a daily amount. When it runs out the app closes until midnight."],
  },
];

export function FocusModeCard({ fullScreen, onFullScreen }: { fullScreen: boolean; onFullScreen: (on: boolean) => void }) {
  const strict = useStrict();
  const [, setMode] = usePrefText("focus:strict");
  const [, setGrace] = usePrefText("focus:grace");
  const [done, setDone] = usePrefText("focus:setup_done");
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState<"iphone" | "android">(() => (typeof navigator !== "undefined" && !isIOS() && /Android/i.test(navigator.userAgent) ? "android" : "iphone"));
  const groups = phone === "iphone" ? IPHONE : ANDROID;
  const set = done === "1";

  return (
    <>
      <Card padded={false} className="overflow-hidden">
        <div className="divide-y divide-hair">
          <ListRow title="Start in full screen" sub="Just the clock. Screen stays on" right={<Toggle checked={fullScreen} onChange={onFullScreen} label="Start in full screen" />} className="pr-3" />
          <div className="px-4 py-4">
            <p className="text-[15px]">If you leave the app</p>
            <SegmentedControl className="mt-3" label="If you leave the app" options={STRICT} value={strict.mode} onChange={(v) => setMode(v === "off" ? null : v)} />
            <p className="t-sub mt-3">{STRICT_COPY[strict.mode]}</p>
            {strict.mode !== "off" ? (
              <div className="mt-4">
                <p className="t-label mb-2">Grace period</p>
                <SegmentedControl size="sm" label="Grace period" options={GRACE} value={strict.grace} onChange={(v) => setGrace(String(v))} />
              </div>
            ) : null}
          </div>
          <div data-setup={set ? "done" : "todo"}>
            <ListRow
              onClick={() => setOpen(true)}
              left={
                <span className={cn("flex size-9 items-center justify-center rounded-full", set ? "grad shadow-glow" : "tile text-ink-2")}>
                  {set ? <Check size={16} strokeWidth={2} aria-hidden /> : <ShieldCheck size={18} strokeWidth={1.75} aria-hidden />}
                </span>
              }
              title={set ? "Phone blocker set up" : "Block the other apps"}
              sub={set ? "See the steps again" : "One time, about three minutes"}
            />
          </div>
        </div>
      </Card>

      {/* The walk through is three screens of phone settings, so it gets a sheet of its own. */}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Block the other apps"
        subtitle="Lock In cannot close another app. Your phone can."
        footer={
          <Button
            full
            size="lg"
            variant={set ? "secondary" : "primary"}
            onClick={() => {
              setDone("1");
              setOpen(false);
            }}
          >
            {set ? "Close" : "I set it up"}
          </Button>
        }
      >
        <SegmentedControl
          label="Your phone"
          options={[
            { value: "iphone", label: "iPhone" },
            { value: "android", label: "Android" },
          ]}
          value={phone}
          onChange={setPhone}
        />
        <ol className="mt-5 space-y-5">
          {groups.map((g, gi) => (
            <li key={g.title} className="flex gap-3.5">
              <span className="tile flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-medium text-ink">{gi + 1}</span>
              <div className="min-w-0 pt-1">
                <p className="text-[15px] font-medium">{g.title}</p>
                <ul className="mt-2 space-y-2">
                  {g.steps.map((s) => (
                    <li key={s} className="text-[14px] leading-snug text-ink-2">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
        <p className="t-caption mt-5 text-ink-2">Menu names shift between phone versions. Search Settings if one is missing.</p>
      </Sheet>
    </>
  );
}

export default FocusModeCard;
