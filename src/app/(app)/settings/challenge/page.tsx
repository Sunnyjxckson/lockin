"use client";

import { useState } from "react";
import { Button, Card, DateField, NumberField, PageHeader, Screen, Section, useToast } from "@/components/ui";
import { getItemByKey, setItemTarget, updateChallenge } from "@/lib/db/helpers";
import { useChallenge, useToday } from "@/lib/db/hooks";
import { challengeEndDate, dayNumber, formatDateLong, isDateStr } from "@/lib/logic/dates";
import type { Challenge } from "@/lib/types";

type Form = Pick<Challenge, "start_date" | "length_days" | "money_target" | "money_deadline" | "daily_floor" | "money_target_start">;

function Editor({ challenge }: { challenge: Challenge }) {
  const toast = useToast();
  const today = useToday();
  const [form, setForm] = useState<Form>({
    start_date: challenge.start_date,
    length_days: challenge.length_days,
    money_target: challenge.money_target,
    money_deadline: challenge.money_deadline,
    daily_floor: challenge.daily_floor,
    money_target_start: challenge.money_target_start ?? null,
  });
  const [saving, setSaving] = useState(false);

  const dirty = (Object.keys(form) as (keyof Form)[]).some((k) => (form[k] ?? null) !== (challenge[k] ?? null));
  const valid =
    isDateStr(form.start_date) && isDateStr(form.money_deadline) && form.length_days >= 1 && form.length_days <= 365 && form.money_target >= 0 && form.daily_floor >= 0;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await updateChallenge(form);
      // The daily floor is also the target of the "Earned today" item.
      if (form.daily_floor !== challenge.daily_floor) {
        const earned = await getItemByKey("earned");
        if (earned) await setItemTarget(earned.id, { kind: "min", min: form.daily_floor });
      }
      toast("Challenge saved", { kind: "done" });
    } catch {
      toast("Could not save", { kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  const end = valid ? challengeEndDate(form.start_date, form.length_days) : null;
  const n = valid ? dayNumber(form.start_date, today) : null;

  return (
    <>
      <Section title="Dates">
        <Card className="flex flex-col gap-4">
          <DateField label="Start date" value={form.start_date} onChange={(v) => set("start_date", v)} />
          <NumberField
            label="Length"
            unit="days"
            decimal={false}
            min={1}
            max={365}
            value={form.length_days}
            onChange={(v) => set("length_days", v ?? 0)}
            live
          />
          {end && n !== null ? (
            <p className="t-sub">
              Ends {formatDateLong(end)}.{" "}
              {n < 1 ? `Starts in ${1 - n} ${1 - n === 1 ? "day" : "days"}.` : n > form.length_days ? "That is already over." : `Today is day ${n}.`}
            </p>
          ) : null}
        </Card>
      </Section>

      <Section title="Money">
        <Card className="flex flex-col gap-4">
          <NumberField label="Target" prefix="$" value={form.money_target} onChange={(v) => set("money_target", v ?? 0)} live />
          <DateField label="Deadline" value={form.money_deadline} onChange={(v) => set("money_deadline", v)} />
          <DateField
            label="Counts from"
            hint="Earnings from this date on count toward the target. Resetting the target on Money moves it to that day."
            value={form.money_target_start && form.money_target_start > form.start_date ? form.money_target_start : form.start_date}
            min={form.start_date}
            onChange={(v) => set("money_target_start", v && v > form.start_date ? v : null)}
          />
          <NumberField
            label="Daily floor"
            prefix="$"
            hint="The least to earn each day. It does not drop when you are ahead."
            value={form.daily_floor}
            onChange={(v) => set("daily_floor", v ?? 0)}
            live
          />
        </Card>
      </Section>

      <div className="mt-7">
        <Button full size="lg" disabled={!dirty || !valid} loading={saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </>
  );
}

export default function ChallengeSettingsPage() {
  const challenge = useChallenge();
  return (
    <Screen>
      <PageHeader title="Challenge" back="/settings" />
      {challenge.data ? <Editor key={challenge.data.id} challenge={challenge.data} /> : null}
    </Screen>
  );
}
