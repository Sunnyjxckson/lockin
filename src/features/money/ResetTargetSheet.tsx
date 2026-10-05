"use client";

import { useState } from "react";
import { Button, DateField, NumberField, Sheet, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { plannedEnd } from "@/lib/logic/challenge";
import { addDays, formatDateShort } from "@/lib/logic/dates";
import { formatMoney, neededPerDay, validNewTarget } from "@/lib/logic/money";
import type { Challenge, DateStr } from "@/lib/types";
import { resetTarget } from "./actions";

/** `earnedToday` is what already counts toward the new target: it starts fresh today. */
export function ResetTargetSheet({ open, onClose, challenge, floor, earnedToday, allTime, today }: { open: boolean; onClose: () => void; challenge: Challenge; floor: number; earnedToday: number; allTime: number; today: DateStr }) {
  if (!open) return null;
  return <Form onClose={onClose} challenge={challenge} floor={floor} total={earnedToday} allTime={allTime} today={today} />;
}

function Form({ onClose, challenge, floor, total, allTime, today }: { onClose: () => void; challenge: Challenge; floor: number; total: number; allTime: number; today: DateStr }) {
  const toast = useToast();
  const end = plannedEnd(challenge);
  const [target, setTarget] = useState<number | null>(challenge.money_target !== null && challenge.money_target > 0 ? challenge.money_target : 1000);
  const [deadline, setDeadline] = useState<DateStr>(end > today ? end : addDays(today, 7));
  const [saving, setSaving] = useState(false);

  const valid = validNewTarget(target, deadline, total, today);
  const need = valid && target !== null ? neededPerDay(target, total, today, deadline, floor) : null;

  const save = async () => {
    if (!valid || target === null) return;
    setSaving(true);
    try {
      await resetTarget(target, deadline, today);
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
      subtitle={`Starts a fresh total from today. The ${formatMoney(allTime)} earned so far stays as your all time total.`}
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
            ? `${formatMoney(need.remaining)} to go by ${formatDateShort(deadline)}. That is ${formatMoney(Math.ceil(need.perDay))} a day over ${need.days} ${need.days === 1 ? "day" : "days"}. The daily floor stays ${formatMoney(floor)}.`
            : "Pick a deadline that is today or later."}
      </p>
    </Sheet>
  );
}
