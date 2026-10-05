"use client";

import { useState } from "react";
import { Button, DateField, NumberField, Sheet, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { addDays, challengeEndDate, formatDateShort } from "@/lib/logic/dates";
import { formatMoney, neededPerDay, validNewTarget } from "@/lib/logic/money";
import type { Challenge, DateStr } from "@/lib/types";
import { resetTarget } from "./actions";

export function ResetTargetSheet({ open, onClose, challenge, total, today }: { open: boolean; onClose: () => void; challenge: Challenge; total: number; today: DateStr }) {
  if (!open) return null;
  return <Form onClose={onClose} challenge={challenge} total={total} today={today} />;
}

function Form({ onClose, challenge, total, today }: { onClose: () => void; challenge: Challenge; total: number; today: DateStr }) {
  const toast = useToast();
  const end = challengeEndDate(challenge.start_date, challenge.length_days);
  const [target, setTarget] = useState<number | null>(Math.ceil((Math.max(total, challenge.money_target) + 500) / 100) * 100);
  const [deadline, setDeadline] = useState<DateStr>(end > today ? end : addDays(today, 7));
  const [saving, setSaving] = useState(false);

  const valid = validNewTarget(target, deadline, total, today);
  const need = valid && target !== null ? neededPerDay(target, total, today, deadline, challenge.daily_floor) : null;

  const save = async () => {
    if (!valid || target === null) return;
    setSaving(true);
    try {
      await resetTarget(target, deadline);
      haptics.done();
      toast("New target set", { kind: "done" });
      onClose();
    } catch {
      toast("Could not save", { kind: "error" });
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="New target"
      subtitle={`${formatMoney(total)} earned so far. It all counts toward the new number.`}
      footer={
        <Button size="lg" full disabled={!valid} loading={saving} onClick={() => void save()}>
          Set target
        </Button>
      }
    >
      <NumberField variant="hero" prefix="$" aria-label="New target" value={target} onChange={setTarget} live max={9999999} decimal={false} />
      <DateField label="Deadline" value={deadline} min={today} onChange={(v) => setDeadline(v as DateStr)} />
      <p className="t-sub mt-4 min-h-10">
        {target !== null && target <= total
          ? `Pick a number above ${formatMoney(total)}.`
          : need && need.perDay !== null
            ? `${formatMoney(need.remaining)} to go by ${formatDateShort(deadline)}. That is ${formatMoney(Math.ceil(need.perDay))} a day over ${need.days} ${need.days === 1 ? "day" : "days"}. The daily floor stays ${formatMoney(challenge.daily_floor)}.`
            : "Pick a deadline that is today or later."}
      </p>
    </Sheet>
  );
}
