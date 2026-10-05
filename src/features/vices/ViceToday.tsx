"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {  } from "lucide-react";
import { Button, PillCheck, ProgressBar, cn } from "@/components/ui";
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
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-baseline gap-1.5">
            <span className={cn("t-value", state === "clean" && "text-accent", over && "text-warn")}>{value === null ? "0" : formatAmount(value, item.unit === "$" ? "$" : null)}</span>
            <span className="truncate text-[14px] text-ink-2">of {formatAmount(target.max, item.unit)} today</span>
          </p>
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
        <ProgressBar className="mt-2.5" value={target.max > 0 ? Math.min(1, (value ?? 0) / target.max) : value ? 1 : 0} tone={over ? "warn" : "accent"} label={`${item.name} today`} />
        {over ? <p className="t-caption mt-2 text-ink-2">Over the cap today.</p> : null}
      </div>
    );
  }

  const slipped = slipsToday.length > 0;
  const clean = state === "clean";
  return (
    <div className="flex items-center gap-2">
      {slipped ? (
        <p className="tile flex h-11 min-w-0 flex-1 items-center rounded-full px-4 text-[14px] text-ink-2">
          <span className="truncate">
            Slip logged at {formatTime(slipsToday[0].time)}
            {slipsToday.length > 1 ? `, ${slipsToday.length} today` : ""}
          </span>
        </p>
      ) : (
        <PillCheck checked={clean} aria-label={`${item.name}: clean today`} onChange={(v) => void setClean(item, today, v)}>
          {clean ? "Clean today" : "Mark clean today"}
        </PillCheck>
      )}
      <Button variant="secondary" size="sm" onClick={onSlip} className="shrink-0">
        Log a slip
      </Button>
    </div>
  );
}
