"use client";

import { useParams } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Button, Card, EmptyState, IconButton, ListRow, PageHeader, Screen, Section, Stat, useToast } from "@/components/ui";
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
  if (!view || !data.challenge) {
    return (
      <Screen>
        <PageHeader title="Vices" back="/vices" />
        <EmptyState title="Not found" body="This one is no longer in your list." />
      </Screen>
    );
  }

  const { item, streak, slips, kept, spend, state } = view;
  const days = viceCalendar(item, data.versions, data.logs, slips, data.challenge.start_date, data.challenge.length_days, data.today);
  const pattern = slipPattern(slips);

  return (
    <Screen>
      <PageHeader
        title={item.name}
        eyebrow={view.rule}
        back="/vices"
        right={
          <IconButton label="Edit" onClick={() => sheets.editVice(item)}>
            <Settings2 size={22} aria-hidden />
          </IconButton>
        }
      />

      <Card className="mt-3">
        <div className="flex items-end justify-between gap-4">
          <Stat label="Clean streak" value={streak.current} unit={streak.current === 1 ? "day" : "days"} size="display" done={state === "clean"} />
          <Stat label="Best" value={streak.best} size="lg" />
        </div>
      </Card>

      {item.active ? (
        <Card padded={false} className="mt-3 overflow-hidden">
          <ViceToday view={view} today={data.today} onSlip={() => sheets.logSlip(item.id)} onAdd={() => sheets.addAmount(item.id)} />
        </Card>
      ) : (
        <Card className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[15px] text-ink-2">Off right now. Past days keep their record.</p>
          <Button variant="secondary" size="sm" onClick={() => void turnOn(item, data.today)}>
            Turn on
          </Button>
        </Card>
      )}

      {kept ? (
        <Card className="mt-3">
          <Stat
            label="Dollars kept"
            value={formatDollars(kept.kept)}
            size="lg"
            sub={
              spend
                ? `${kept.cleanDays} clean ${kept.cleanDays === 1 ? "day" : "days"} at about ${formatDollars(Math.round(spendPerDay(spend) * 100) / 100)} a day${kept.spent > 0 ? `, minus ${formatDollars(kept.spent)} spent` : ""}`
                : "Add a typical spend to see this."
            }
          />
          {!spend ? (
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => sheets.editVice(item)}>
              Set typical spend
            </Button>
          ) : null}
        </Card>
      ) : null}

      <Section title="Challenge">
        <Card>
          <ViceCalendar days={days} />
        </Card>
      </Section>

      <Section title="Pattern" right={pattern.total > 0 ? `${pattern.total} ${pattern.total === 1 ? "slip" : "slips"}` : undefined}>
        {pattern.total === 0 ? (
          <Card>
            <EmptyState compact title="No slips logged" body="If one happens, log it with the time and what set it off. That is what makes a pattern show up here." />
          </Card>
        ) : (
          <Card padded={false} className="overflow-hidden">
            <div className="divide-y divide-line">
              {pattern.timeOfDay ? <ListRow title={cap(pattern.timeOfDay.value)} sub="Most common time of day" right={of(pattern.timeOfDay.count, pattern.total)} /> : null}
              <ListRow
                title={pattern.trigger ? cap(pattern.trigger.value) : "None noted"}
                sub="Most common trigger"
                right={pattern.trigger ? of(pattern.trigger.count, pattern.total) : undefined}
              />
              {pattern.weekday ? <ListRow title={WEEKDAY_NAMES[pattern.weekday.value]} sub="Most common day" right={of(pattern.weekday.count, pattern.total)} /> : null}
            </div>
          </Card>
        )}
      </Section>

      {slips.length > 0 ? (
        <Section title="Slips">
          <Card padded={false} className="overflow-hidden">
            <div className="divide-y divide-line">
              {slips.map((s) => (
                <ListRow
                  key={s.id}
                  title={`${WEEKDAY_NAMES[weekdayOf(s.date)].slice(0, 3)}, ${formatDateShort(s.date)} at ${formatTime(s.time)}`}
                  sub={s.trigger ? cap(s.trigger) : "No trigger noted"}
                  right={s.amount !== null ? <span className="tnum">{formatDollars(s.amount)}</span> : undefined}
                  onClick={() => sheets.editSlip(s)}
                />
              ))}
            </div>
          </Card>
        </Section>
      ) : null}

      {item.active ? (
        <div className="mt-7 flex flex-col gap-2">
          <Button variant="secondary" full onClick={() => sheets.logSlip(item.id)}>
            Log a slip
          </Button>
          <Button
            variant="ghost"
            full
            onClick={async () => {
              await turnOff(item, data.today);
              toast("Off from today. Past days keep their record.", { kind: "info" });
            }}
          >
            Turn off
          </Button>
        </div>
      ) : null}
      {sheets.node}
    </Screen>
  );
}
