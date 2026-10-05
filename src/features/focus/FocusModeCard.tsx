"use client";

// Strict mode, and the one time walk through for pairing the timer with the
// phone's own blocker. The phone's settings are what actually keep TikTok
// shut. This app only watches and records.

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { Button, Card, SegmentedControl, Toggle, cn } from "@/components/ui";
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
  off: "Leaving is recorded and the time away comes off the session. You can claim it back if you were still working.",
  end: "Leave for longer than the grace period and the session ends at the moment you left.",
  void: "Leave for longer than the grace period and the whole session is thrown out. Nothing is logged.",
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
  // Closed until asked for: three screens of phone settings should not sit between the timer and the sessions.
  const show = open;
  const groups = phone === "iphone" ? IPHONE : ANDROID;

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">Start in full screen</p>
            <p className="text-[13px] text-ink-3">Just the clock, and the screen stays on.</p>
          </div>
          <Toggle checked={fullScreen} onChange={onFullScreen} label="Start in full screen" />
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-[15px] font-semibold">If you leave the app</p>
          <SegmentedControl className="mt-2" label="If you leave the app" options={STRICT} value={strict.mode} onChange={(v) => setMode(v === "off" ? null : v)} />
          <p className="mt-2 text-[13px] text-ink-2">{STRICT_COPY[strict.mode]}</p>
          {strict.mode !== "off" ? (
            <div className="mt-3">
              <p className="t-label mb-1.5">Grace period</p>
              <SegmentedControl size="sm" label="Grace period" options={GRACE} value={strict.grace} onChange={(v) => setGrace(String(v))} />
            </div>
          ) : null}
        </div>
      </Card>

      <Card padded={false} data-setup={done === "1" ? "done" : "todo"}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={show} className="flex w-full items-center gap-3 p-4 text-left">
          <ShieldCheck size={22} className={cn("shrink-0", done === "1" ? "text-accent" : "text-ink-2")} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold">{done === "1" ? "Phone blocker set up" : "Block the other apps"}</span>
            <span className="block text-[13px] text-ink-2">{done === "1" ? "Tap to see the steps again." : "One time setup on your phone, about three minutes."}</span>
          </span>
          <ChevronDown size={18} className={cn("shrink-0 text-ink-3 transition-transform", show && "rotate-180")} aria-hidden />
        </button>
        {show ? (
          <div className="border-t border-line p-4">
            <p className="text-[14px] text-ink-2">
              Lock In cannot lock your phone or close another app. No website can. Your phone can, and it takes one setup. Do it once and turn it on whenever you start the timer.
            </p>
            <SegmentedControl
              className="mt-3"
              label="Your phone"
              options={[
                { value: "iphone", label: "iPhone" },
                { value: "android", label: "Android" },
              ]}
              value={phone}
              onChange={setPhone}
            />
            <div className="mt-4 space-y-4">
              {groups.map((g, gi) => (
                <div key={g.title}>
                  <p className="text-[15px] font-semibold">
                    <span className="tnum text-ink-3">{gi + 1}. </span>
                    {g.title}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {g.steps.map((s) => (
                      <li key={s} className="flex gap-2.5 text-[14px] text-ink-2">
                        <span className="mt-[9px] size-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[13px] text-ink-3">Menu names shift a little between phone versions. Search Settings for the name if one is not where it says.</p>
            <Button
              full
              className="mt-4"
              variant={done === "1" ? "secondary" : "primary"}
              onClick={() => {
                setDone("1");
                setOpen(false);
              }}
            >
              {done === "1" ? "Close" : "I set it up"}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default FocusModeCard;
