"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button, CheckMark, ProgressBar, cn } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { formatTime } from "@/lib/logic/dates";
import { formatAmount } from "@/lib/logic/vices";
import type { ChecklistItem, DateStr, ViceSlip } from "@/lib/types";
import { setAmount, setClean, type ViceView } from "./data";

const AmountSheet = dynamic(() => import("./AmountSheet").then((m) => m.AmountSheet), { ssr: false });
const SlipSheet = dynamic(() => import("./SlipSheet").then((m) => m.SlipSheet), { ssr: false });
const ViceSheet = dynamic(() => import("./ViceSheet").then((m) => m.ViceSheet), { ssr: false });

// ---------- sheets shared by the list and the detail screen ----------

type Open =
  | { kind: "slip"; itemId?: string; slip?: ViceSlip; note?: string }
  | { kind: "amount"; itemId: string }
  | { kind: "vice"; item?: ChecklistItem }
  | null;

export function useViceSheets(vices: ViceView[], today: DateStr) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const find = (id?: string) => vices.find((v) => v.item.id === id);

  let node: React.ReactNode = null;
  if (open?.kind === "slip") {
    const one = find(open.slip?.item_id ?? open.itemId);
    node = (
      <SlipSheet
        vices={one ? [one.item] : vices.filter((v) => v.item.active).map((v) => v.item)}
        itemId={open.itemId}
        slip={open.slip}
        note={open.note}
        today={today}
        onClose={close}
      />
    );
  } else if (open?.kind === "amount") {
    const v = find(open.itemId);
    if (v && v.target.kind === "max") {
      node = (
        <AmountSheet
          item={v.item}
          date={today}
          current={v.log?.value ?? null}
          cap={v.target.max}
          onClose={close}
          onWentOver={() => setOpen({ kind: "slip", itemId: v.item.id, note: "That put today over the cap. Note what set it off if you want." })}
        />
      );
    }
  } else if (open?.kind === "vice") {
    node = <ViceSheet item={open.item} today={today} onClose={close} />;
  }

  return {
    node,
    logSlip: (itemId?: string) => setOpen({ kind: "slip", itemId }),
    editSlip: (slip: ViceSlip) => setOpen({ kind: "slip", slip }),
    addAmount: (itemId: string) => setOpen({ kind: "amount", itemId }),
    editVice: (item?: ChecklistItem) => setOpen({ kind: "vice", item }),
  };
}

// ---------- today's state for one vice ----------

export interface ViceTodayProps {
  view: ViceView;
  today: DateStr;
  onSlip: () => void;
  onAdd: () => void;
}

export function ViceToday({ view, today, onSlip, onAdd }: ViceTodayProps) {
  const { item, target, log, state, slipsToday } = view;

  if (target.kind === "max") {
    const value = log?.value ?? null;
    const over = value !== null && value > target.max;
    return (
      <div className="px-4 py-3.5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="t-label">Today</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className={cn("t-num-sm tnum", state === "clean" && "text-accent", over && "text-warn")}>
                {value === null ? "0" : formatAmount(value, item.unit === "$" ? "$" : null)}
              </span>
              <span className="text-[14px] text-ink-3">of {formatAmount(target.max, item.unit)}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {value === null ? (
              <Button variant="ghost" size="sm" onClick={() => void setAmount(item, today, 0)}>
                None today
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={onAdd}>
              Add
            </Button>
          </div>
        </div>
        <ProgressBar
          className="mt-3"
          value={target.max > 0 ? Math.min(1, (value ?? 0) / target.max) : value ? 1 : 0}
          tone={over ? "warn" : "accent"}
          label={`${item.name} today`}
        />
        {over ? <p className="mt-2 text-[13px] text-ink-3">Over the cap today.</p> : null}
      </div>
    );
  }

  const slipped = slipsToday.length > 0;
  const clean = state === "clean";
  return (
    <div className="flex min-h-[64px] items-center gap-2 pr-4">
      {slipped ? (
        <p className="min-w-0 flex-1 py-3 pl-4 text-[15px] text-ink-2">
          Slip logged at {formatTime(slipsToday[0].time)}
          {slipsToday.length > 1 ? `, ${slipsToday.length} today` : ""}
        </p>
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={clean}
          aria-label={`${item.name}: clean today`}
          onClick={() => {
            if (clean) haptics.tap();
            else haptics.done();
            void setClean(item, today, !clean);
          }}
          className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3.5 rounded-bl-[20px] pl-4 text-left active:bg-surface-2"
        >
          <CheckMark checked={clean} />
          <span className="min-w-0">
            <span className={cn("block text-[16px] font-medium", clean ? "text-ink-2" : "text-ink")}>Clean today</span>
            {!clean ? <span className="block text-[13px] text-ink-3">Check at end of day</span> : null}
          </span>
        </button>
      )}
      <Button variant="secondary" size="sm" onClick={onSlip} className="shrink-0">
        Log a slip
      </Button>
    </div>
  );
}
