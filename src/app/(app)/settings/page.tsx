"use client";

import { useState } from "react";
import { BellRing, CalendarClock, Dumbbell, ListChecks, Target } from "lucide-react";
import { Button, Card, ListRow, PageHeader, Screen, Section, Sheet, Toggle, useToast } from "@/components/ui";
import { LOCK_EVENT } from "@/components/app/AppShell";
import { lockLocally } from "@/lib/auth/local";
import { isSupabaseMode } from "@/lib/db";
import { resetAllData, updateSettings } from "@/lib/db/helpers";
import { clearQueryCache, useChallenge, useSettings } from "@/lib/db/hooks";
import { formatDateShort } from "@/lib/logic/dates";

export default function SettingsPage() {
  const toast = useToast();
  const settings = useSettings();
  const challenge = useChallenge();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = challenge.data;

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

      <Section title="The challenge">
        <Card padded={false} className="overflow-hidden">
          <div className="divide-y divide-line">
            <ListRow href="/settings/checklist" left={<ListChecks size={20} aria-hidden />} title="Checklist" sub="Items, order and targets" />
            <ListRow href="/settings/schedule" left={<CalendarClock size={20} aria-hidden />} title="Schedule" sub="The template for each weekday" />
            <ListRow href="/settings/workouts" left={<Dumbbell size={20} aria-hidden />} title="Workouts" sub="Exercises, sets, reps and lift days" />
            <ListRow
              href="/settings/challenge"
              left={<Target size={20} aria-hidden />}
              title="Challenge"
              sub={c ? `Starts ${formatDateShort(c.start_date)}, ${c.length_days} days, $${c.money_target.toLocaleString("en-US")} by ${formatDateShort(c.money_deadline)}` : "Dates and money target"}
            />
            <ListRow href="/settings/reminders" left={<BellRing size={20} aria-hidden />} title="Reminders" sub="On or off, and when" />
          </div>
        </Card>
      </Section>

      <Section title="This device">
        <Card padded={false} className="overflow-hidden">
          <div className="divide-y divide-line">
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
