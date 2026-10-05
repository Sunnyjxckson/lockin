"use client";

import Link from "next/link";
import { ChevronRight, Plus, ShieldBan } from "lucide-react";
import { Button, Card, EmptyState, IconButton, ListRow, PageHeader, Screen, SectionLabel, Toggle, cn, useToast } from "@/components/ui";
import { formatDollars } from "@/lib/logic/vices";
import { turnOff, turnOn, useVices, type ViceView } from "@/features/vices/data";
import { ViceToday, useViceSheets } from "@/features/vices/ViceToday";

/** One vice: the streak as the number, its name, and today's control under it. No card. */
function ViceBlock({ view, today, onSlip, onAdd }: { view: ViceView; today: string; onSlip: () => void; onAdd: () => void }) {
  const { item, streak, rule, kept, state } = view;
  return (
    <li className="py-5">
      <Link href={`/vices/${item.id}`} className="pressable flex min-h-11 items-center gap-4 px-1">
        <span className="flex w-[68px] shrink-0 items-baseline gap-1">
          <span className={cn("t-num", state === "clean" ? "text-accent" : "text-ink")}>{streak.current}</span>
          <span className="t-caption text-ink-2">{streak.current === 1 ? "day" : "days"}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-medium tracking-[-0.01em] text-ink">{item.name}</span>
          <span className="t-caption mt-1 block truncate text-ink-2">
            {rule}
            {kept ? `, ${formatDollars(kept.kept)} kept` : ""}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
      </Link>
      <div className="mt-3.5 px-1">
        <ViceToday view={view} today={today} onSlip={onSlip} onAdd={onAdd} />
      </div>
    </li>
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

  const cleanToday = data.active.filter((v) => v.state === "clean").length;

  return (
    <Screen>
      <PageHeader
        title="Vices"
        back="/today"
        right={
          <IconButton label="Add your own" onClick={() => sheets.editVice()}>
            <Plus size={22} strokeWidth={1.75} aria-hidden />
          </IconButton>
        }
      />

      {data.loading ? null : (
        <div className="animate-fade-in">
          {data.active.length === 0 ? (
            <EmptyState icon={<ShieldBan size={22} strokeWidth={1.75} aria-hidden />} title="Nothing on yet" body="Turn one on below, or add your own. Each keeps its own streak." className="!py-10" />
          ) : (
            <section aria-label="Clean streaks">
              <SectionLabel right={`${cleanToday} of ${data.active.length} clean`}>Today</SectionLabel>
              <ul className="mt-1 divide-y divide-hair border-b border-hair">
                {data.active.map((v) => (
                  <ViceBlock key={v.item.id} view={v} today={data.today} onSlip={() => sheets.logSlip(v.item.id)} onAdd={() => sheets.addAmount(v.item.id)} />
                ))}
              </ul>
            </section>
          )}

          <section className="mt-7" aria-label="Library">
            <SectionLabel right={`${data.active.length} on`} className="mb-3">
              Library
            </SectionLabel>
            <Card padded={false} className="overflow-hidden">
              <div className="divide-y divide-hair">
                {data.library.map((v) => (
                  <ListRow key={v.item.id} title={v.item.name} sub={v.item.active ? v.rule : undefined} right={<Toggle checked={v.item.active} onChange={(on) => void toggle(v, on)} label={v.item.name} />} />
                ))}
              </div>
            </Card>
            <Button variant="secondary" full className="mt-3" icon={<Plus size={18} strokeWidth={1.75} aria-hidden />} onClick={() => sheets.editVice()}>
              Add your own
            </Button>
          </section>
        </div>
      )}
      {sheets.node}
    </Screen>
  );
}
