"use client";

import { useState } from "react";
import { BellRing, CalendarClock, Dumbbell, Images, ListChecks, Target, Timer, UtensilsCrossed } from "lucide-react";
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
      ? `${mode.finished.name} is done. Close it or restart it`
      : mode.upcoming
        ? `${mode.upcoming.name} starts ${formatDateShort(mode.upcoming.start_date)}`
        : "Ongoing. Start a challenge when you want a set run";

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
      <PageHeader title="Settings" back="/today" subtitle="Changes apply from today forward. Earlier days keep the targets they were scored against." />

      <Section title="Your days">
        <Card padded={false} className="overflow-hidden">
          <div className="divide-y divide-line">
            <ListRow href="/settings/checklist" left={<ListChecks size={20} aria-hidden />} title="Checklist" sub="Items, order and targets" />
            <ListRow href="/settings/schedule" left={<CalendarClock size={20} aria-hidden />} title="Schedule" sub="The template for each weekday" />
            <ListRow href="/settings/workouts" left={<Dumbbell size={20} aria-hidden />} title="Workouts" sub="Exercises, sets, reps and lift days" />
            <ListRow
              href="/settings/challenge"
              left={<Target size={20} aria-hidden />}
              title="Challenge"
              sub={challengeLine}
            />
            <ListRow href="/settings/reminders" left={<BellRing size={20} aria-hidden />} title="Reminders" sub="On or off, and when" />
          </div>
        </Card>
      </Section>

      <Section title="Look">
        <ThemePicker />
        <Card padded={false} className="mt-3 overflow-hidden">
          <ListRow href="/boards" left={<Images size={20} aria-hidden />} title="Boards" sub="Pull a palette from a mood board and make it the theme" />
        </Card>
      </Section>

      <Section title="More">
        <Card padded={false} className="overflow-hidden">
          <div className="divide-y divide-line">
            <ListRow href="/meals" left={<UtensilsCrossed size={20} aria-hidden />} title="Meals" sub="Week plan, recipes and the grocery list" />
            <ListRow href="/focus" left={<Timer size={20} aria-hidden />} title="Focus" sub="Study timer and hours" />
          </div>
        </Card>
      </Section>

      <Section title="You">
        <TextField
          key={settings.data?.display_name ?? ""}
          label="Name"
          hint="Today greets you by it. Leave it empty for no name."
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
          <div className="divide-y divide-line">
            <ListRow href="/reminders" title="Notifications" sub="Turn push on for this device, and see what is set up" />
            <ListRow
              title="Haptics"
              sub="A tap when you check something off"
              right={
                <Toggle
                  label="Haptics"
                  checked={settings.data?.haptics ?? true}
                  onChange={(v) => void updateSettings({ haptics: v })}
                />
              }
            />
            <ListRow title="Lock now" sub="Ask for the passcode again" onClick={() => void lock()} />
            <ListRow title="Data" sub={isSupabaseMode() ? "Synced to Supabase" : "Stored on this device only"} />
          </div>
        </Card>
      </Section>

      <Section title="Danger">
        <Button variant="danger" full onClick={() => setConfirmReset(true)}>
          Reset all data
        </Button>
      </Section>

      <Sheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset everything?"
        subtitle="Every log, earning, meal and setting goes back to the starting defaults. This cannot be undone."
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
