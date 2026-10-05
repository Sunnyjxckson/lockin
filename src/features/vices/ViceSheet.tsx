"use client";

import { useState } from "react";
import { Button, NumberField, SegmentedControl, Sheet, TextField, Toggle, useToast } from "@/components/ui";
import { removeItem } from "@/lib/db/helpers";
import { CAP_UNITS, spendOf, type SpendPeriod } from "@/lib/logic/vices";
import type { ChecklistItem, DateStr } from "@/lib/types";
import { createVice, updateVice } from "./data";

export interface ViceSheetProps {
  /** The vice to change or turn on. Leave out to add a new one. */
  item?: ChecklistItem;
  today: DateStr;
  onClose: () => void;
  onSaved?: (item: ChecklistItem) => void;
}

/** Add your own, change a rule, or turn a library vice on. Mount it to open it. */
export function ViceSheet({ item, today, onClose, onSaved }: ViceSheetProps) {
  const toast = useToast();
  const seeded = !!item?.key;
  const oldSpend = item ? spendOf(item) : null;

  const [name, setName] = useState(item?.name ?? "");
  const [mode, setMode] = useState<"quit" | "cap">(item?.mode === "cap" ? "cap" : "quit");
  const [cap, setCap] = useState<number | null>(item?.target.kind === "max" ? item.target.max : null);
  const [unit, setUnit] = useState<string>(item?.mode === "cap" && item.unit ? item.unit : "min");
  const [money, setMoney] = useState(item?.tracks_money ?? false);
  const [spend, setSpend] = useState<number | null>(oldSpend?.amount ?? null);
  const [period, setPeriod] = useState<SpendPeriod>(oldSpend?.period ?? "week");
  const [busy, setBusy] = useState(false);

  const ready = name.trim().length > 0 && (mode === "quit" || (cap !== null && cap >= 0));
  const turningOn = !!item && !item.active;

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const input = {
        name,
        mode,
        cap: mode === "cap" ? cap : null,
        unit: mode === "cap" ? unit : null,
        tracksMoney: money,
        spend: money && spend !== null && spend > 0 ? { amount: spend, period } : null,
      };
      const saved = item ? await updateVice(item, input, today) : await createVice(input, today);
      toast(item && !turningOn ? "Saved. Applies from today." : "On from today", { kind: "info" });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", { kind: "error" });
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    setBusy(true);
    await removeItem(item.id, today);
    toast("Removed. Past days keep their record.", { kind: "info" });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={!item ? "Add your own" : turningOn ? item.name : "Edit"}
      subtitle={!item ? undefined : turningOn ? "Counts from today." : "Changes apply from today. Past days keep the rule they had."}
      footer={
        <div className="flex gap-2.5">
          {item && !seeded && !turningOn ? (
            <Button variant="ghost" size="lg" onClick={remove} disabled={busy}>
              Remove
            </Button>
          ) : null}
          <Button size="lg" full onClick={save} loading={busy} disabled={!ready}>
            {!item ? "Add" : turningOn ? "Turn on" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        {!seeded ? (
          <TextField
            label="Name"
            value={name}
            onChange={setName}
            placeholder={mode === "cap" ? "Social media" : "No late night snacks"}
            maxLength={40}
            autoFocus={!item}
          />
        ) : null}

        <SegmentedControl
          label="Rule"
          value={mode}
          onChange={setMode}
          options={[
            { value: "quit", label: "Quit completely" },
            { value: "cap", label: "Cap it" },
          ]}
        />

        {mode === "cap" ? (
          <div className="flex flex-col gap-2.5">
            <NumberField
              label="Daily cap"
              value={cap}
              onChange={setCap}
              live
              prefix={unit === "$" ? "$" : undefined}
              unit={unit === "$" ? undefined : unit}
              hint="Clean means at or under this."
              placeholder="30"
            />
            <SegmentedControl label="Unit" size="sm" value={unit} onChange={setUnit} options={CAP_UNITS.map((u) => ({ value: u.value as string, label: u.label }))} />
          </div>
        ) : null}

        {!seeded ? (
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span>
              <span className="block text-[16px] font-medium">Costs money</span>
              <span className="block text-[13px] text-ink-3">Shows dollars kept.</span>
            </span>
            <Toggle checked={money} onChange={setMoney} label="Costs money" />
          </label>
        ) : null}

        {money ? (
          <div className="flex flex-col gap-2.5">
            <NumberField
              label="Typical spend"
              value={spend}
              onChange={setSpend}
              live
              prefix="$"
              hint="A rough number is fine. Dollars kept is worked out from clean days."
              placeholder="0"
            />
            <SegmentedControl
              label="Per"
              size="sm"
              value={period}
              onChange={setPeriod}
              options={[
                { value: "day", label: "Per day" },
                { value: "week", label: "Per week" },
              ]}
            />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
