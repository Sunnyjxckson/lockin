"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Share } from "lucide-react";
import { Card, CheckMark, EmptyState, PageHeader, ProgressBar, ProgressRing, Screen, Section, cn } from "@/components/ui";
import { useChallenge, useChecklist, useLogs, useToday } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { challengeEndDate, formatDateLong, formatDateShort, weekStart } from "@/lib/logic/dates";
import {
  buildProgress,
  countLabel,
  type GridCell,
  type GridModel,
  type Headline,
  type ItemRate,
  type StreakRow,
  type WeekRollup,
} from "@/lib/logic/progress";
import { DaySheet } from "./DaySheet";
import { WeeklyReview } from "./WeeklyReview";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const KIND_LABEL: Record<GridCell["kind"], string> = {
  full: "locked in",
  partial: "partial",
  missed: "missed",
  open: "nothing checked yet",
  future: "not here yet",
};

// ---------- headline ----------

function Numbers({ h }: { h: Headline }) {
  const cells: { label: string; value: number; tone?: string }[] = [
    { label: "Locked in", value: h.lockedIn, tone: h.lockedIn > 0 ? "text-accent" : undefined },
    { label: "Partial", value: h.partial },
    { label: "Missed", value: h.missed, tone: h.missed > 0 ? "text-danger" : undefined },
    { label: "Left", value: h.remaining },
  ];
  return (
    <Card className="mt-3">
      <div className="flex items-center gap-4">
        <ProgressRing value={h.percent / 100} size={104} stroke={10} label="Overall completion">
          <span className="t-num-sm">
            {h.percent}
            <span className="text-[16px] text-ink-3">%</span>
          </span>
        </ProgressRing>
        <div className="min-w-0">
          <div className="t-label">{h.finished ? "Challenge done" : "Day"}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="t-display">{h.day}</span>
            <span className="text-[20px] font-medium text-ink-3">of {h.length}</span>
          </div>
          <div className="t-sub mt-1.5">{h.percent}% of items done so far</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 divide-x divide-line border-t border-line pt-4">
        {cells.map((c) => (
          <div key={c.label} className="px-1 text-center">
            <div className={cn("t-num-sm", c.tone)}>{c.value}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{c.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- grid ----------

function DayCell({ cell, onOpen }: { cell: GridCell; onOpen: (c: GridCell) => void }) {
  const future = cell.kind === "future";
  const label = `Day ${cell.day}, ${formatDateLong(cell.date)}, ${cell.isToday ? "today, " : ""}${KIND_LABEL[cell.kind]}${
    future ? "" : `, ${cell.done} of ${cell.total} done`
  }`;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={future}
      onClick={() => {
        haptics.tap();
        onOpen(cell);
      }}
      className={cn(
        "tnum relative flex aspect-square min-h-11 items-center justify-center overflow-hidden rounded-[12px] text-[15px] font-semibold",
        !future && "pressable",
        cell.kind === "full" && "bg-accent text-accent-ink",
        cell.kind === "partial" && "border border-accent-line bg-surface-2 text-ink",
        cell.kind === "missed" && "border border-danger/40 bg-danger-soft text-danger",
        cell.kind === "open" && "bg-surface-2 text-ink",
        future && "border border-dashed border-line text-ink-3",
        cell.isToday && "outline outline-2 outline-offset-2 outline-ink",
      )}
    >
      {cell.kind === "partial" ? (
        <span aria-hidden className="absolute inset-x-0 bottom-0 bg-accent-soft" style={{ height: `${Math.max(12, cell.percent)}%` }} />
      ) : null}
      <span className="relative">{cell.day}</span>
    </button>
  );
}

function Legend() {
  const items: { label: string; cls: string }[] = [
    { label: "Full", cls: "bg-accent" },
    { label: "Partial", cls: "border border-accent-line bg-accent-soft" },
    { label: "Missed", cls: "border border-danger/40 bg-danger-soft" },
    { label: "Today", cls: "bg-surface-2 outline outline-[1.5px] outline-offset-1 outline-ink" },
  ];
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-3">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-3 rounded-[4px]", i.cls)} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Grid({ grid, onOpen }: { grid: GridModel; onOpen: (c: GridCell) => void }) {
  return (
    <Card>
      <div className="grid grid-cols-7 gap-1.5" aria-hidden>
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="pb-0.5 text-center text-[11px] font-semibold text-ink-3">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: grid.lead }, (_, i) => (
          <span key={`lead${i}`} aria-hidden />
        ))}
        {grid.cells.map((cell) => (
          <DayCell key={cell.date} cell={cell} onOpen={onOpen} />
        ))}
      </div>
      <Legend />
    </Card>
  );
}

// ---------- streaks ----------

function streakNote(r: StreakRow): { text: string; cls: string } {
  if (r.health === "broken") return { text: `Lost a run of ${countLabel(r.best, r.unit)}`, cls: "text-warn" };
  if (r.health === "cold") return { text: "Not started", cls: "text-ink-3" };
  if (r.health === "behind") return { text: `Best ${r.best}`, cls: "text-ink-3" };
  return { text: "Best run yet", cls: "text-accent" };
}

function Streaks({ rows }: { rows: StreakRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState compact title="Nothing in the checklist" body="Add items in Settings and their streaks show up here." />
      </Card>
    );
  }
  return (
    <Card padded={false} className="overflow-hidden">
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const note = streakNote(r);
          return (
            <li key={r.item.id} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[16px] font-medium text-ink">{r.item.name}</span>
                  {r.item.category === "vice" ? (
                    <span className="shrink-0 rounded-full border border-line px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                      Vice
                    </span>
                  ) : null}
                </span>
                <span className={cn("mt-0.5 block text-[13px]", note.cls)}>{note.text}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className={cn("t-num-sm", r.current === 0 ? "text-ink-3" : r.health === "best" ? "text-accent" : "text-ink")}>
                  {r.current}
                </span>
                <span className="ml-1 text-[13px] font-medium text-ink-3">{r.unit === "week" ? "wk" : r.current === 1 ? "day" : "days"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---------- rates ----------

function Rates({ rows }: { rows: ItemRate[] }) {
  return (
    <Card>
      <ul className="space-y-3.5">
        {rows.map((r) => (
          <li key={r.item.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn("min-w-0 truncate text-[15px] font-medium", r.current ? "text-ink" : "text-ink-3")}>
                {r.item.name}
                {r.current ? null : <span className="ml-1.5 text-[12px] font-normal">removed</span>}
              </span>
              <span className="tnum shrink-0 text-[13px] text-ink-3">
                {r.rate === null ? (
                  "Due this week"
                ) : (
                  <>
                    {r.done} of {r.total}
                    {r.unit === "week" ? " wk" : ""}
                    <span className={cn("ml-2 inline-block w-10 text-right text-[15px] font-semibold", r.rate === 1 ? "text-accent" : "text-ink")}>
                      {Math.round(r.rate * 100)}%
                    </span>
                  </>
                )}
              </span>
            </div>
            <ProgressBar className="mt-1.5" height={6} value={r.rate ?? 0} label={`${r.item.name} completion`} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------- weeks ----------

function WeekCard({ week, grid }: { week: WeekRollup; grid: GridModel }) {
  const cells = grid.cells.filter((c) => c.date >= week.from && c.date <= week.to);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="t-h2">Week {week.index}</span>
            {week.state === "current" ? (
              <span className="rounded-full border border-line-strong px-2 py-px text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                Now
              </span>
            ) : null}
          </div>
          <div className="t-sub mt-0.5">
            {formatDateShort(week.from)} to {formatDateShort(week.to)}
          </div>
        </div>
        <div className="text-right">
          <span className={cn("t-num-sm", week.percent === 100 && "text-accent")}>{week.percent ?? 0}</span>
          <span className="text-[15px] font-medium text-ink-3">%</span>
        </div>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {cells.map((c) => (
          <span
            key={c.date}
            className={cn(
              "h-2 flex-1 rounded-full",
              c.kind === "full" && "bg-accent",
              c.kind === "partial" && "bg-accent-line",
              c.kind === "missed" && "bg-danger/60",
              c.kind === "open" && "bg-ink-3",
              c.kind === "future" && "bg-surface-3",
            )}
          />
        ))}
      </div>
      <div className="t-sub mt-2.5">
        {week.full} full, {week.partial} partial, {week.missed} missed
      </div>
      {week.weekly.length > 0 ? (
        <ul className="mt-3 space-y-2.5 border-t border-line pt-3">
          {week.weekly.map((r) => (
            <li key={r.item.id} className="flex items-center gap-2.5">
              <CheckMark checked={r.done} size={22} />
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{r.item.name}</span>
              <span className={cn("shrink-0 text-[13px]", r.done ? "text-accent" : week.state === "past" ? "text-danger" : "text-ink-3")}>
                {r.done && r.doneOn ? formatDateShort(r.doneOn) : week.state === "past" ? "Missed" : "Due by Sunday"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

// ---------- screen ----------

export function ProgressScreen() {
  const today = useToday();
  const challenge = useChallenge();
  const checklist = useChecklist();
  const c = challenge.data;
  const start = c?.start_date ?? today;
  const end = c ? challengeEndDate(c.start_date, c.length_days) : today;
  // Read from the Monday before the start so the first week's weekly items roll up whole.
  const logs = useLogs(weekStart(start), today > end ? end : today);
  const [openDate, setOpenDate] = useState<string | null>(null);

  const model = useMemo(() => {
    if (!c) return null;
    return buildProgress({
      startDate: c.start_date,
      lengthDays: c.length_days,
      today,
      items: checklist.data.items,
      versions: checklist.data.versions,
      logs: logs.data,
    });
  }, [c, today, checklist.data, logs.data]);

  const loading = challenge.loading || checklist.loading || logs.loading;
  const openCell = model && openDate ? (model.grid.cells.find((x) => x.date === openDate) ?? null) : null;

  const share = (
    <Link
      href="/progress/card"
      aria-label="Share progress card"
      title="Share progress card"
      className="pressable inline-flex size-11 items-center justify-center rounded-full text-ink-2"
    >
      <Share size={22} aria-hidden />
    </Link>
  );

  if (!model || !c) {
    return (
      <Screen>
        <PageHeader title="Progress" />
        {loading ? null : <EmptyState title="No challenge yet" body="Set a start date in Settings and the grid lands here." />}
      </Screen>
    );
  }

  const h = model.headline;
  const weeks = model.weeks.filter((w) => w.state !== "future").reverse();
  const noLogsYet = logs.data.length === 0;

  return (
    <Screen>
      <PageHeader title="Progress" right={share} />

      {h.started ? (
        <Numbers h={h} />
      ) : (
        <Card className="mt-3">
          <EmptyState
            compact
            icon={<CalendarClock size={22} aria-hidden />}
            title={`Starts ${formatDateLong(c.start_date)}`}
            body={`${c.length_days} days, ending ${formatDateShort(end)}. The grid fills in from day 1.`}
          />
        </Card>
      )}

      <Section title={`${model.grid.length} days`} right={h.started && !h.finished ? `${countLabel(h.remaining, "day")} left` : undefined}>
        <Grid grid={model.grid} onOpen={(cell) => setOpenDate(cell.date)} />
        {h.started && noLogsYet ? (
          <p className="t-sub mt-3 px-1">Nothing logged yet. Check items off on Today and this fills in. Tap a day to see what was hit and what was not.</p>
        ) : null}
      </Section>

      {h.started ? (
        <>
          <Section title="Streaks" right="Slipping first">
            <Streaks rows={model.streaks} />
          </Section>

          {model.rates.length > 0 ? (
            <Section title="Completion by item" right="Lowest first">
              <Rates rows={model.rates} />
            </Section>
          ) : null}

          <Section title="Weeks">
            <div className="space-y-3">
              {weeks.map((w) => (
                <WeekCard key={w.weekStart} week={w} grid={model.grid} />
              ))}
            </div>
          </Section>
        </>
      ) : null}

      <WeeklyReview />

      <DaySheet cell={openCell} onClose={() => setOpenDate(null)} />
    </Screen>
  );
}
