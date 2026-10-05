"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { ActionButton, BigNumber, GlassCard, List, ListRow, SectionLabel, cn } from "@/components/ui";
import { useChecklist, useList, useMode, useSettings } from "@/lib/db/hooks";
import { weighInDateFor, weightSeries, weightTrend } from "@/lib/logic/body";
import { dayWindow } from "@/lib/logic/challenge";
import { addDays, dayNumber, formatDateLong, formatDateShort, weekStart } from "@/lib/logic/dates";
import { WEEKDAY_NAMES, type DateStr } from "@/lib/types";
import { fmt, signed } from "./format";
import { PhotoCompare } from "./PhotoCompare";
import { WeightChart } from "./WeightChart";

const WeighInSheet = dynamic(() => import("./WeighInSheet").then((m) => m.WeighInSheet), { ssr: false });

export function WeightTab() {
  const mode = useMode();
  const today = mode.today;
  const { data: settings } = useSettings();
  const { data: checklist } = useChecklist();
  const { data: logs, loading } = useList("body_log", { orderBy: "date" });
  const unit = settings?.weight_unit ?? "lb";
  // The chart covers the running challenge, or the last twelve weeks.
  const w = useMemo(() => dayWindow(mode, today, 84), [mode, today]);
  const start = w.start;
  const length = w.length;
  const numbered = w.numbered;

  const [sheet, setSheet] = useState<{ key: number; date: DateStr } | null>(null);
  const seq = useRef(0);
  const open = (date: DateStr) => {
    seq.current += 1;
    setSheet({ key: seq.current, date });
  };

  const series = useMemo(() => weightSeries(logs, start, length), [logs, start, length]);
  const trend = useMemo(() => weightTrend(series), [series]);
  const history = useMemo(() => weightSeries(logs).reverse(), [logs]);

  const weighItem = checklist.items.find((i) => i.key === "weighin");
  const weighDay = weighItem?.weekly_day ?? 5;
  const dueDate = weighInDateFor(weekStart(today), weighDay);
  const doneThisWeek = logs.some((l) => l.weight !== null && l.date >= weekStart(today) && l.date <= today);
  const due = doneThisWeek ? "Done" : dueDate === today ? "This morning" : dueDate > today ? WEEKDAY_NAMES[weighDay] : "Still open";
  const dueLine = doneThisWeek ? "This week's weigh-in is in." : dueDate === today ? "Before you eat." : dueDate > today ? formatDateLong(dueDate) : `${WEEKDAY_NAMES[weighDay]}'s is open. Log it today.`;

  return (
    <div className="animate-fade-in">
      {trend ? (
        <section className="pt-5" aria-label="Weight">
          <BigNumber
            label={`Latest, ${numbered ? `day ${trend.latest.day}` : formatDateShort(trend.latest.date)}`}
            value={fmt(trend.latest.weight, 1)}
            unit={unit}
            sub={
              series.length > 1 ? (
                <>
                  <span className={trend.direction === "down" ? "text-accent" : "text-ink"}>{signed(trend.change)}</span> {unit} since {numbered ? `day ${trend.first.day}` : formatDateShort(trend.first.date)}
                  {trend.perWeek !== null ? `. ${signed(trend.perWeek)} a week.` : "."}
                </>
              ) : (
                "One weigh-in so far. The line starts with the next."
              )
            }
          />
          <div className="mt-3">
            <WeightChart series={series} lengthDays={length} todayDay={dayNumber(start, today)} unit={unit} label={numbered ? undefined : (d) => formatDateShort(addDays(start, d - 1))} />
          </div>
        </section>
      ) : loading ? (
        <div className="h-56" />
      ) : (
        <section className="pt-6 pb-1" aria-label="Weight">
          <p className="t-label">Weight</p>
          <p className="t-greeting mt-2.5 text-ink">No weigh-ins yet</p>
          <p className="t-sub mt-2.5">Step on the scale {WEEKDAY_NAMES[weighDay]} morning. The line builds from there.</p>
        </section>
      )}

      <GlassCard className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="t-label">Weigh-in</p>
            <p className={cn("t-h1 mt-1.5 flex items-center gap-2 truncate", doneThisWeek && "text-accent")}>
              {doneThisWeek ? <Check size={20} strokeWidth={2} aria-hidden /> : null}
              {due}
            </p>
          </div>
          <ActionButton label="Log weight" onClick={() => open(today)}>
            <Plus size={24} strokeWidth={1.75} aria-hidden />
          </ActionButton>
        </div>
        <p className="t-sub mt-3">{dueLine}</p>
      </GlassCard>

      <section className="mt-7" aria-label="Progress photos">
        <SectionLabel className="mb-3">Progress photos</SectionLabel>
        <PhotoCompare logs={logs} startDate={numbered ? start : null} unit={unit} onAdd={() => open(today)} />
      </section>

      {history.length > 0 ? (
        <section className="mt-7" aria-label="Weigh-ins">
          <SectionLabel right={history.length}>Weigh-ins</SectionLabel>
          <List className="mt-1.5">
            {history.map((p, i) => {
              const prev = history[i + 1];
              const delta = prev ? Math.round((p.weight - prev.weight) * 10) / 10 : null;
              const day = numbered && dayNumber(start, p.date) >= 1 && dayNumber(start, p.date) <= length ? `Day ${dayNumber(start, p.date)}` : null;
              return (
                <ListRow
                  key={p.date}
                  title={formatDateLong(p.date)}
                  sub={[day, delta !== null ? `${signed(delta)} ${unit}` : null].filter(Boolean).join(", ") || undefined}
                  value={fmt(p.weight, 1)}
                  onClick={() => open(p.date)}
                />
              );
            })}
          </List>
        </section>
      ) : null}

      {sheet ? <WeighInSheet key={sheet.key} logs={logs} initialDate={sheet.date} today={today} unit={unit} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}
