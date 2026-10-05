"use client";

import Link from "next/link";
import { ChevronRight, Plus, ShieldBan } from "lucide-react";
import { Button, Card, EmptyState, IconButton, ListRow, PageHeader, Screen, Section, Toggle, cn, useToast } from "@/components/ui";
import { formatDollars } from "@/lib/logic/vices";
import { turnOff, turnOn, useVices, type ViceView } from "@/features/vices/data";
import { ViceToday, useViceSheets } from "@/features/vices/ViceToday";

function ViceCard({ view, today, onSlip, onAdd }: { view: ViceView; today: string; onSlip: () => void; onAdd: () => void }) {
  const { item, streak, rule, kept, state } = view;
  return (
    <Card padded={false} className="overflow-hidden">
      <Link href={`/vices/${item.id}`} className="pressable flex items-center gap-4 px-4 py-4 active:bg-surface-2">
        <span className="flex w-[72px] shrink-0 flex-col items-center">
          <span className={cn("t-num tnum", state === "clean" && "text-accent")}>{streak.current}</span>
          <span className="mt-1 text-[11px] font-medium tracking-wide text-ink-3 uppercase">{streak.current === 1 ? "day clean" : "days clean"}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[17px] leading-snug font-semibold tracking-[-0.01em]">{item.name}</span>
          <span className="mt-0.5 block truncate text-[13px] text-ink-3">{rule}</span>
          {kept ? <span className="tnum mt-0.5 block truncate text-[13px] text-ink-2">{formatDollars(kept.kept)} kept</span> : null}
        </span>
        <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
      </Link>
      <div className="border-t border-line">
        <ViceToday view={view} today={today} onSlip={onSlip} onAdd={onAdd} />
      </div>
    </Card>
  );
}

export default function VicesPage() {
  const data = useVices();
  const toast = useToast();
  const sheets = useViceSheets(data.library, data.today);

  const toggle = async (view: ViceView, on: boolean) => {
    if (!on) {
      await turnOff(view.item, data.today);
      toast("Off from today. Past days keep their record.", { kind: "info" });
      return;
    }
    // A money vice asks for a typical spend on the way in.
    if (view.item.tracks_money && !view.spend) sheets.editVice(view.item);
    else await turnOn(view.item, data.today);
  };

  return (
    <Screen>
      <PageHeader
        title="Vices"
        back="/today"
        right={
          <IconButton label="Add your own" onClick={() => sheets.editVice()}>
            <Plus size={22} aria-hidden />
          </IconButton>
        }
      />

      {data.loading ? null : (
        <>
          <div className="mt-3 flex flex-col gap-3">
            {data.active.length === 0 ? (
              <Card>
                <EmptyState
                  compact
                  icon={<ShieldBan size={24} aria-hidden />}
                  title="Nothing on yet"
                  body="Turn one on from the library below, or add your own. Each gets its own clean streak."
                />
              </Card>
            ) : (
              data.active.map((v) => (
                <ViceCard key={v.item.id} view={v} today={data.today} onSlip={() => sheets.logSlip(v.item.id)} onAdd={() => sheets.addAmount(v.item.id)} />
              ))
            )}
          </div>

          <Section title="Library" right={`${data.active.length} on`}>
            <Card padded={false} className="overflow-hidden">
              <div className="divide-y divide-line">
                {data.library.map((v) => (
                  <ListRow
                    key={v.item.id}
                    title={v.item.name}
                    sub={v.item.active ? v.rule : undefined}
                    right={<Toggle checked={v.item.active} onChange={(on) => void toggle(v, on)} label={v.item.name} />}
                  />
                ))}
              </div>
            </Card>
            <Button variant="secondary" full className="mt-3" icon={<Plus size={18} aria-hidden />} onClick={() => sheets.editVice()}>
              Add your own
            </Button>
          </Section>
        </>
      )}
      {sheets.node}
    </Screen>
  );
}
