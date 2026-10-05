"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Scale } from "lucide-react";
import { Button, Card, EmptyState, ListRow, Section, Stat, cn } from "@/components/ui";
import { useChallenge, useChecklist, useList, useSettings, useToday } from "@/lib/db/hooks";
import { weighInDateFor, weightSeries, weightTrend } from "@/lib/logic/body";
import { dayNumber, formatDateLong, formatDateShort, weekStart } from "@/lib/logic/dates";
import { WEEKDAY_NAMES, type DateStr } from "@/lib/types";
import { fmt, signed } from "./format";
import { PhotoCompare } from "./PhotoCompare";
import { WeighInSheet } from "./WeighInSheet";
import { WeightChart } from "./WeightChart";

export function WeightTab() {
  const today = useToday();
  const { data: challenge } = useChallenge();
  const { data: settings } = useSettings();
  const { data: checklist } = useChecklist();
  const { data: logs, loading } = useList("body_log", { orderBy: "date" });
  const unit = settings?.weight_unit ?? "lb";
  const start = challenge?.start_date ?? null;
  const length = challenge?.length_days ?? 30;

  const [sheet, setSheet] = useState<{ key: number; date: DateStr } | null>(null);
  const seq = useRef(0);
  const open = (date: DateStr) => {
    seq.current += 1;
    setSheet({ key: seq.current, date });
  };

  const series = useMemo(() => weightSeries(logs, start ?? undefined, length), [logs, start, length]);
  const trend = useMemo(() => weightTrend(series), [series]);
  const history = useMemo(() => weightSeries(logs).reverse(), [logs]);

  const weighItem = checklist.items.find((i) => i.key === "weighin");
  const weighDay = weighItem?.weekly_day ?? 5;
  const dueDate = weighInDateFor(weekStart(today), weighDay);
  const doneThisWeek = logs.some((l) => l.weight !== null && l.date >= weekStart(today) && l.date <= today);
  const dueLine = doneThisWeek
    ? "This week's weigh-in is done."
    : dueDate === today
      ? "Weigh-in is due this morning."
      : dueDate > today
        ? `Next weigh-in: ${formatDateLong(dueDate)}.`
        : `${WEEKDAY_NAMES[weighDay]}'s weigh-in is still open. Log it today.`;

  return (
    <>
      <Card className="animate-fade-in mt-4">
        {trend ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <Stat label="Latest" value={fmt(trend.latest.weight, 1)} unit={unit} sub={`${formatDateShort(trend.latest.date)}, day ${trend.latest.day}`} />
              {series.length > 1 ? (
                <div className="pb-1 text-right">
                  <p className={cn("t-num-sm tnum", trend.direction === "down" && "text-accent")}>{signed(trend.change)}</p>
                  <p className="t-sub mt-1">{unit} since day {trend.first.day}</p>
                  {trend.perWeek !== null ? <p className="tnum mt-0.5 text-[13px] text-ink-3">{signed(trend.perWeek)} a week</p> : null}
                </div>
              ) : null}
            </div>
            <div className="mt-4">
              <WeightChart series={series} lengthDays={length} todayDay={start ? dayNumber(start, today) : null} unit={unit} />
            </div>
            {series.length === 1 ? <p className="t-sub mt-2">One weigh-in so far. The line starts with the next one.</p> : null}
          </>
        ) : loading ? (
          <div className="h-40" />
        ) : (
          <EmptyState compact icon={<Scale size={22} aria-hidden />} title="No weigh-ins yet" body="Step on the scale Friday morning. The line over the 30 days builds from there." />
        )}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
          <p className={cn("min-w-0 flex-1 text-[14px]", doneThisWeek ? "text-accent" : "text-ink-2")}>{dueLine}</p>
          <Button size="sm" icon={<Plus size={16} aria-hidden />} onClick={() => open(today)}>
            Log weight
          </Button>
        </div>
      </Card>

      <Section title="Progress photos">
        <PhotoCompare logs={logs} startDate={start} unit={unit} onAdd={() => open(today)} />
      </Section>

      {history.length > 0 ? (
        <Section title="Weigh-ins">
          <Card padded={false} className="overflow-hidden">
            <div className="divide-y divide-line">
              {history.map((p, i) => {
                const prev = history[i + 1];
                const delta = prev ? Math.round((p.weight - prev.weight) * 10) / 10 : null;
                return (
                  <ListRow
                    key={p.date}
                    title={formatDateLong(p.date)}
                    sub={start && dayNumber(start, p.date) >= 1 ? `Day ${dayNumber(start, p.date)}` : undefined}
                    onClick={() => open(p.date)}
                    right={
                      <span className="text-right">
                        <span className="tnum block text-[17px] font-semibold text-ink">
                          {fmt(p.weight, 1)} <span className="text-[13px] font-medium text-ink-3">{unit}</span>
                        </span>
                        {delta !== null ? <span className={cn("tnum block text-[12px]", delta < 0 ? "text-accent" : "text-ink-3")}>{signed(delta)}</span> : null}
                      </span>
                    }
                  />
                );
              })}
            </div>
          </Card>
        </Section>
      ) : null}

      {sheet ? <WeighInSheet key={sheet.key} logs={logs} initialDate={sheet.date} today={today} unit={unit} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
