"use client";

import { useState } from "react";
import { Button, NumberField, SegmentedControl, Sheet, TextField, TimeField, cn, useToast } from "@/components/ui";
import { useInstalledOn, useNow } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { addDays, formatDateLong, isDayEditable, timeNY } from "@/lib/logic/dates";
import { TRIGGER_CHIPS, joinTriggers, splitTriggers } from "@/lib/logic/vices";
import type { ChecklistItem, DateStr, ViceSlip } from "@/lib/types";
import { removeSlip, saveSlip } from "./data";

export interface SlipSheetProps {
  /** The vices to choose from. One means no picker. */
  vices: ChecklistItem[];
  /** Preselected vice. */
  itemId?: string;
  /** Pass a slip to edit it. */
  slip?: ViceSlip;
  today: DateStr;
  /** Shown under the title in place of the default line. */
  note?: string;
  onClose: () => void;
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        haptics.tap();
        onClick();
      }}
      className={cn(
        "pressable h-11 rounded-full border px-4 text-[15px] font-medium transition-colors",
        on ? "border-ink bg-ink text-bg" : "border-line bg-surface-2 text-ink-2",
      )}
    >
      {children}
    </button>
  );
}

/** Mount it to open it. Captures when, what set it off, and dollars for a money vice. */
export function SlipSheet({ vices, itemId, slip, today, note, onClose }: SlipSheetProps) {
  const toast = useToast();
  const now = useNow();
  const installedOn = useInstalledOn();
  const known = (TRIGGER_CHIPS as readonly string[]);
  const before = splitTriggers(slip?.trigger);

  const [pick, setPick] = useState<string | null>(slip?.item_id ?? itemId ?? (vices.length === 1 ? vices[0].id : null));
  const [date, setDate] = useState<DateStr>(slip?.date ?? today);
  const [time, setTime] = useState(() => slip?.time ?? timeNY());
  const [chips, setChips] = useState<string[]>(before.filter((t) => known.includes(t)));
  const [text, setText] = useState(before.filter((t) => !known.includes(t)).join(", "));
  const [amount, setAmount] = useState<number | null>(slip?.amount ?? null);
  const [busy, setBusy] = useState(false);

  const item = vices.find((v) => v.id === pick) ?? null;
  const yesterday = addDays(today, -1);
  const canYesterday = !slip && isDayEditable(yesterday, now, installedOn);

  const save = async () => {
    if (!item) return;
    setBusy(true);
    try {
      await saveSlip({ id: slip?.id, item, date, time, trigger: joinTriggers(chips, text), amount: item.tracks_money ? amount : null });
      haptics.tap();
      toast(slip ? "Saved" : "Logged", { kind: "info" });
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", { kind: "error" });
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!slip) return;
    setBusy(true);
    await removeSlip(slip.id);
    toast("Removed", { kind: "info" });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={slip ? "Edit slip" : "Log a slip"}
      subtitle={note ?? (slip ? formatDateLong(slip.date) : "It only restarts this one streak. Everything else carries on.")}
      footer={
        <div className="flex gap-2.5">
          {slip ? (
            <Button variant="ghost" size="lg" onClick={remove} disabled={busy}>
              Remove
            </Button>
          ) : null}
          <Button size="lg" full onClick={save} loading={busy} disabled={!item}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        {vices.length > 1 && !slip ? (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">Which one</p>
            <div className="flex flex-wrap gap-2">
              {vices.map((v) => (
                <Chip key={v.id} on={pick === v.id} onClick={() => setPick(v.id)}>
                  {v.name}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">When</p>
          <div className="flex flex-col gap-2.5">
            {canYesterday ? (
              <SegmentedControl
                label="Day"
                value={date}
                onChange={setDate}
                options={[
                  { value: today, label: "Today" },
                  { value: yesterday, label: "Yesterday" },
                ]}
              />
            ) : null}
            <TimeField value={time} onChange={setTime} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">What set it off</p>
          <div className="flex flex-wrap gap-2">
            {TRIGGER_CHIPS.map((c) => (
              <Chip key={c} on={chips.includes(c)} onClick={() => setChips((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))}>
                {c}
              </Chip>
            ))}
          </div>
          <div className="mt-2.5">
            <TextField value={text} onChange={setText} placeholder="Something else" maxLength={120} />
          </div>
        </div>

        {item?.tracks_money ? <NumberField label="Amount spent" prefix="$" value={amount} onChange={setAmount} live placeholder="0" /> : null}
      </div>
    </Sheet>
  );
}
