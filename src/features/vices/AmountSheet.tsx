"use client";

import { useState } from "react";
import { Button, NumberField, Sheet } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { formatAmount, quickAdds } from "@/lib/logic/vices";
import type { ChecklistItem, DateStr } from "@/lib/types";
import { setAmount } from "./data";

export interface AmountSheetProps {
  item: ChecklistItem;
  date: DateStr;
  /** Logged so far today. */
  current: number | null;
  cap: number;
  onClose: () => void;
  /** Called after a save that took the day from under the cap to over it. */
  onWentOver?: () => void;
}

/** Add to the running amount for a capped vice. Mount it to open it. */
export function AmountSheet({ item, date, current, cap, onClose, onWentOver }: AmountSheetProps) {
  const [add, setAdd] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const so = current ?? 0;
  const total = so + (add ?? 0);
  const dollars = item.unit === "$";

  const save = async () => {
    if (add === null) return;
    setBusy(true);
    await setAmount(item, date, total);
    haptics.tap();
    onClose();
    if (so <= cap && total > cap) onWentOver?.();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      subtitle={`${formatAmount(so, item.unit)} so far today. Cap is ${formatAmount(cap, item.unit)}.`}
      footer={
        <Button size="lg" full onClick={save} loading={busy} disabled={add === null}>
          {add === null ? "Add" : `Add, total ${formatAmount(total, item.unit)}`}
        </Button>
      }
    >
      <NumberField
        variant="hero"
        label="Add"
        value={add}
        onChange={setAdd}
        live
        autoFocus
        prefix={dollars ? "$" : undefined}
        unit={dollars ? undefined : (item.unit ?? undefined)}
      />
      <div className="flex justify-center gap-2 pb-2">
        {quickAdds(item.unit).map((n) => (
          <Button key={n} variant="secondary" size="sm" onClick={() => setAdd((add ?? 0) + n)}>
            +{n}
          </Button>
        ))}
      </div>
    </Sheet>
  );
}
