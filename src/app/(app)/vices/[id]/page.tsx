"use client";

import { useParams } from "next/navigation";
import { Settings2 } from "lucide-react";
import { BigNumber, Button, GlassCard, IconButton, EmptyState, List, ListRow, PageHeader, Screen, SectionLabel, TrackStat, useToast } from "@/components/ui";
import { formatDateShort, formatTime, weekdayOf } from "@/lib/logic/dates";
import { WEEKDAY_NAMES, formatDollars, slipPattern, spendPerDay, viceCalendar } from "@/lib/logic/vices";
import { turnOff, turnOn, useVices } from "@/features/vices/data";
import { ViceCalendar } from "@/features/vices/ViceCalendar";
import { ViceToday, useViceSheets } from "@/features/vices/ViceToday";

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function of(count: number, total: number): string {
  return `${count} of ${total}`;
}

export default function ViceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const data = useVices();
  const toast = useToast();
  const sheets = useViceSheets(data.library, data.today);
  const view = data.library.find((v) => v.item.id === id);

  if (data.loading) {
    return (
      <Screen>
        <PageHeader title="Vices" back="/vices" />
      </Screen>
    );
  }
  if (!view) {
    return (
      <Screen>
        <PageHeader title="Vices" back="/vices" />
        <EmptyState title="Not found" body="This one is no longer in your list." />
      </Screen>
    );
  }

  const { item, streak, slips, kept, spend, state } = view;
  const w = data.window;
  const days = viceCalendar(item, data.versions, data.logs, slips, w.start, w.length, data.today, w.numbered);
  const pattern = slipPattern(slips);

  return (
    <Screen>
      <PageHeader
        title={item.name}
        eyebrow={view.rule}
        back="/vices"
        right={
          <IconButton label="Edit" onClick={() => sheets.editVice(item)}>
            <Settings2 size={22} strokeWidth={1.75} aria-hidden />
          </IconButton>
        }
      />

      <section className="pt-1" aria-label="Clean streak">
        <BigNumber
          label={<span className={state === "clean" ? "text-accent" : undefined}>Clean streak</span>}
          value={streak.current}
          unit={streak.current === 1 ? "day" : "days"}
        />
      </section>

      {item.active ? (
        <GlassCard className="mt-5">
          <p className="t-label mb-3">Today</p>
          <ViceToday view={view} today={data.today} onSlip={() => sheets.logSlip(item.id)} onAdd={() => sheets.addAmount(item.id)} />
        </GlassCard>
      ) : (
        <div className="tile mt-5 flex items-center justify-between gap-3 rounded-[20px] py-2.5 pr-2.5 pl-4">
          <p className="t-sub">Off. Past days keep their record.</p>
          <Button variant="secondary" size="sm" onClick={() => void turnOn(item, data.today)}>
            Turn on
          </Button>
        </div>
      )}

      <div className={`mt-6 grid gap-3.5 px-1 ${kept ? "grid-cols-3" : "grid-cols-2"}`}>
        <TrackStat label="Best" value={`${streak.best}d`} />
        <TrackStat label="Slips" value={pattern.total} />
        {kept ? <TrackStat label="Kept" value={formatDollars(kept.kept)} /> : null}
      </div>
      {kept ? (
        spend ? (
          <p className="t-sub mt-4 px-1">
            {kept.cleanDays} clean {kept.cleanDays === 1 ? "day" : "days"} at about {formatDollars(Math.round(spendPerDay(spend) * 100) / 100)} a day
            {kept.spent > 0 ? `, minus ${formatDollars(kept.spent)} spent` : ""}.
          </p>
        ) : (
          <div className="tile mt-5 flex items-center justify-between gap-3 rounded-[20px] py-2.5 pr-2.5 pl-4">
            <p className="t-sub">Add a typical spend to see dollars kept.</p>
            <Button variant="secondary" size="sm" onClick={() => sheets.editVice(item)}>
              Set typical spend
            </Button>
          </div>
        )
      ) : null}

      <section className="mt-7" aria-label="Calendar">
        <SectionLabel className="mb-3">{w.name ?? `Last ${w.length} days`}</SectionLabel>
        <ViceCalendar days={days} />
      </section>

      <section className="mt-7" aria-label="Pattern">
        <SectionLabel right={pattern.total > 0 ? `${pattern.total} ${pattern.total === 1 ? "slip" : "slips"}` : undefined}>Pattern</SectionLabel>
        {pattern.total === 0 ? (
          <EmptyState compact title="No slips logged" body="Log one with the time and what set it off, and the pattern shows here." />
        ) : (
          <List className="mt-1.5">
            {pattern.timeOfDay ? <ListRow title={cap(pattern.timeOfDay.value)} sub="Most common time of day" right={of(pattern.timeOfDay.count, pattern.total)} /> : null}
            <ListRow title={pattern.trigger ? cap(pattern.trigger.value) : "None noted"} sub="Most common trigger" right={pattern.trigger ? of(pattern.trigger.count, pattern.total) : undefined} />
            {pattern.weekday ? <ListRow title={WEEKDAY_NAMES[pattern.weekday.value]} sub="Most common day" right={of(pattern.weekday.count, pattern.total)} /> : null}
          </List>
        )}
      </section>

      {slips.length > 0 ? (
        <section className="mt-7" aria-label="Slips">
          <SectionLabel>Slips</SectionLabel>
          <List className="mt-1.5">
            {slips.map((s) => (
              <ListRow
                key={s.id}
                title={`${WEEKDAY_NAMES[weekdayOf(s.date)].slice(0, 3)}, ${formatDateShort(s.date)} at ${formatTime(s.time)}`}
                sub={s.trigger ? cap(s.trigger) : "No trigger noted"}
                right={s.amount !== null ? formatDollars(s.amount) : undefined}
                onClick={() => sheets.editSlip(s)}
              />
            ))}
          </List>
        </section>
      ) : null}

      {item.active ? (
        <Button
          className="mt-7"
          variant="ghost"
          full
          onClick={async () => {
            await turnOff(item, data.today);
            toast("Off from today. Past days keep their record.", { kind: "info" });
          }}
        >
          Turn off
        </Button>
      ) : null}
      {sheets.node}
    </Screen>
  );
}
