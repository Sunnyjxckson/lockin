"use client";

import { useState } from "react";
import { BellRing, CalendarClock, Dumbbell, Images, ListChecks, MessageSquareText, Target, Timer, UtensilsCrossed } from "lucide-react";
import { Button, Card, ListRow, PageHeader, Screen, Section, Sheet, TextField, Toggle, useToast } from "@/components/ui";
import { ThemePicker } from "@/components/app/ThemePicker";
import { LOCK_EVENT } from "@/components/app/AppShell";
import { lockLocally } from "@/lib/auth/local";
import { isSupabaseMode } from "@/lib/db";
import { resetAllData, updateSettings } from "@/lib/db/helpers";
import { clearQueryCache, useMode, useSettings } from "@/lib/db/hooks";
import { formatDateShort } from "@/lib/logic/dates";
import { loadTheme } from "@/lib/theme";

export default function SettingsPage() {
  const toast = useToast();
  const settings = useSettings();
  const mode = useMode();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const challengeLine = mode.challenge
    ? `${mode.challenge.name}, day ${mode.day} of ${mode.length}`
    : mode.finished
      ? `${mode.finished.name} is done`
      : mode.upcoming
        ? `${mode.upcoming.name} starts ${formatDateShort(mode.upcoming.start_date)}`
        : "Ongoing";

  const lock = async () => {
    lockLocally();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.dispatchEvent(new Event(LOCK_EVENT));
  };

  const reset = async () => {
    setBusy(true);
    try {
      await resetAllData();
      clearQueryCache();
      await loadTheme().catch(() => undefined);
      setConfirmReset(false);
      toast("Everything was reset", { kind: "done" });
    } catch {
      toast("Could not reset", { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="Settings" back="/today" subtitle="Changes apply from today on." />

      <Section title="Your days">
        <Card padded={false} className="overflow-hidden">
          <div className="divide-y divide-hair">
            <ListRow href="/settings/checklist" left={<ListChecks size={20} strokeWidth={1.75} aria-hidden />} title="Checklist" sub="Items and targets" />
            <ListRow href="/settings/schedule" left={<CalendarClock size={20} strokeWidth={1.75} aria-hidden />} title="Weekly plan" sub="What each weekday starts from" />
            <ListRow href="/settings/workouts" left={<Dumbbell size={20} strokeWidth={1.75} aria-hidden />} title="Workouts" sub="Exercises and lift days" />
            <ListRow
              href="/settings/challenge"
              left={<Target size={20} strokeWidth={1.75} aria-hidden />}
              title="Challenge"
              sub={challengeLine}
            />
            <ListRow href="/settings/reminders" left={<BellRing size={20} strokeWidth={1.75} aria-hidden />} title="Reminders" sub="What and when" />
            <ListRow href="/settings/coach" left={<MessageSquareText size={20} strokeWidth={1.75} aria-hidden />} title="Coach" sub="Voice and check-ins" />
          </div>
        </Card>
      </Section>

      <Section title="Look">
        <ThemePicker />
        <Card padded={false} className="mt-3 overflow-hidden">
          <ListRow href="/boards" left={<Images size={20} strokeWidth={1.75} aria-hidden />} title="Boards" sub="Wear a mood board's palette" />
        </Card>
      </Section>

      <Section title="More">
        <Card padded={false} className="overflow-hidden">
          <div className="divide-y divide-hair">
            <ListRow href="/meals" left={<UtensilsCrossed size={20} strokeWidth={1.75} aria-hidden />} title="Meals" sub="Plan, recipes, groceries" />
            <ListRow href="/focus" left={<Timer size={20} strokeWidth={1.75} aria-hidden />} title="Focus" sub="Study timer" />
          </div>
        </Card>
      </Section>

      <Section title="You">
        <TextField
          key={settings.data?.display_name ?? ""}
          label="Name"
          hint="Today greets you by it."
          value={name ?? settings.data?.display_name ?? ""}
          onChange={setName}
          onCommit={(v) => {
            const next = v.trim().slice(0, 24) || null;
            if (next !== (settings.data?.display_name ?? null)) void updateSettings({ display_name: next }).then(() => toast("Saved", { kind: "done" }));
          }}
          maxLength={24}
          placeholder="Your first name"
        />
      </Section>

      <Section title="This device">
        <Card padded={false} className="overflow-hidden">
          <div className="divide-y divide-hair">
            <ListRow href="/reminders" title="Notifications" sub="Push on this device" />
            <ListRow
              title="Haptics"
              sub="A tap on each tick"
              right={
                <Toggle
                  label="Haptics"
                  checked={settings.data?.haptics ?? true}
                  onChange={(v) => void updateSettings({ haptics: v })}
                />
              }
            />
            <ListRow title="Lock now" sub="Asks for the passcode" onClick={() => void lock()} />
            <ListRow title="Data" sub={isSupabaseMode() ? "Synced to Supabase" : "On this device only"} />
          </div>
        </Card>
      </Section>

      <Button variant="danger" full className="mt-7" onClick={() => setConfirmReset(true)}>
        Reset all data
      </Button>

      <Sheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset everything?"
        subtitle="Every log and setting goes back to the defaults. This cannot be undone."
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" full onClick={() => setConfirmReset(false)}>
              Keep my data
            </Button>
            <Button variant="danger" full loading={busy} onClick={() => void reset()}>
              Reset
            </Button>
          </div>
        }
      >
        {null}
      </Sheet>
    </Screen>
  );
}
