"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Share } from "lucide-react";
import { Card, CheckMark, EmptyState, PageHeader, ProgressBar, ProgressRing, Screen, Section, SegmentedControl, cn } from "@/components/ui";
import { useChecklist, useLogs, useMode } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { STATUS_LABEL, challengeItems, consistencyLabel, daysRun, lastDay, pastChallenges, plannedEnd } from "@/lib/logic/challenge";
import { addDays, formatDateLong, formatDateShort, weekStart } from "@/lib/logic/dates";
import { ongoingHeadline, ongoingMonths, ongoingWeeks, statusByDate, type OngoingHeadline, type OngoingMonth, type OngoingWeek } from "@/lib/logic/ongoing";
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
import type { Challenge } from "@/lib/types";
import { WeeklyReview } from "@/features/coach/WeeklyReview";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const KIND_LABEL: Record<GridCell["kind"], string> = {
  full: "locked in",
  partial: "partial",
  missed: "missed",
  open: "nothing checked yet",
  future: "not here yet",
  before: "before your history starts",
};

// ---------- headline ----------

const DaySheet = dynamic(() => import("./DaySheet").then((m) => m.DaySheet), { ssr: false });

function Numbers({ h, name }: { h: Headline; name?: string }) {
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
          <div className="t-label truncate">{name ? `${name} · ` : ""}{h.finished ? "Done" : "Day"}</div>
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

/** One day as a square. `dated` cells belong to the ongoing view and are named by their date, not a day count. */
function DayCell({ cell, dated = false, onOpen }: { cell: GridCell; dated?: boolean; onOpen: (c: GridCell) => void }) {
  const future = cell.kind === "future" || cell.kind === "before";
  const label = `${dated ? "" : `Day ${cell.day}, `}${formatDateLong(cell.date)}, ${cell.isToday ? "today, " : ""}${KIND_LABEL[cell.kind]}${
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
        cell.kind === "future" && "border border-dashed border-line text-ink-3",
        cell.kind === "before" && "text-ink-3 opacity-40",
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
              (c.kind === "future" || c.kind === "before") && "bg-surface-3",
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

// ---------- ongoing ----------

function OngoingNumbers({ h }: { h: OngoingHeadline }) {
  const c = h.last30;
  const cells: { label: string; value: string; tone?: string }[] = [
    { label: "Last 7", value: h.last7.days > 0 ? `${h.last7.full}/${h.last7.days}` : "0", tone: h.last7.days > 0 && h.last7.full === h.last7.days ? "text-accent" : undefined },
    { label: "In a row", value: `${h.fullStreak}`, tone: h.fullStreak > 0 ? "text-accent" : undefined },
    { label: "Best run", value: `${h.bestFullStreak}` },
    { label: "All time", value: `${h.fullDays}` },
  ];
  return (
    <Card className="mt-3" data-ongoing-numbers>
      <div className="flex items-center gap-4">
        <ProgressRing value={c.days > 0 ? c.full / c.days : 0} size={104} stroke={10} label="Full days out of the days counted">
          <span className="t-num-sm">
            {c.percent}
            <span className="text-[16px] text-ink-3">%</span>
          </span>
        </ProgressRing>
        <div className="min-w-0">
          <div className="t-label">{c.days < c.window ? "Days locked in" : `Last ${c.window} days`}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="t-display">{c.full}</span>
            <span className="text-[20px] font-medium text-ink-3">of {c.days}</span>
          </div>
          <div className="t-sub mt-1.5">{c.days === 0 ? "Today is the first day." : `${consistencyLabel(c)} were full`}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 divide-x divide-line border-t border-line pt-4">
        {cells.map((x) => (
          <div key={x.label} className="px-1 text-center">
            <div className={cn("t-num-sm", x.tone)}>{x.value}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{x.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function tallyLine(t: { full: number; partial: number; missed: number }): string {
  return `${t.full} full, ${t.partial} partial, ${t.missed} missed`;
}

function OngoingWeekCard({ week, onOpen }: { week: OngoingWeek; onOpen: (c: GridCell) => void }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="t-h2">{week.label}</span>
            {week.state === "current" ? (
              <span className="rounded-full border border-line-strong px-2 py-px text-[11px] font-semibold uppercase tracking-wider text-ink-2">Now</span>
            ) : null}
          </div>
          <div className="t-sub mt-0.5">{tallyLine(week)}</div>
        </div>
        <div className="text-right">
          <span className={cn("t-num-sm", week.percent === 100 && "text-accent")}>{week.full}</span>
          <span className="text-[15px] font-medium text-ink-3">/{week.days}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {week.cells.map((cell) => (
          <DayCell key={cell.date} cell={cell} dated onOpen={onOpen} />
        ))}
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

function OngoingMonthCard({ month, onOpen }: { month: OngoingMonth; onOpen: (c: GridCell) => void }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="t-h2">{month.label}</span>
          <div className="t-sub mt-0.5">{tallyLine(month)}</div>
        </div>
        <div className="text-right">
          <span className={cn("t-num-sm", month.percent === 100 && "text-accent")}>{month.full}</span>
          <span className="text-[15px] font-medium text-ink-3">/{month.days}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5" aria-hidden>
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="pb-0.5 text-center text-[11px] font-semibold text-ink-3">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: month.lead }, (_, i) => (
          <span key={`lead${i}`} aria-hidden />
        ))}
        {month.cells.map((cell) => (
          <DayCell key={cell.date} cell={cell} dated onOpen={onOpen} />
        ))}
      </div>
    </Card>
  );
}

// ---------- screen ----------

const VIEWS = [
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
] as const;

/** How many weeks the ongoing view opens with. "Show earlier" adds more: it has no end. */
const WEEKS_STEP = 6;
const MONTHS_STEP = 3;

export function ProgressScreen() {
  const mode = useMode();
  const today = mode.today;
  const checklist = useChecklist();
  const start = mode.historyStart;
  // From the Monday before the history starts, so the first week's weekly items roll up whole.
  const logs = useLogs(weekStart(start), today);
  const [open, setOpen] = useState<{ cell: GridCell; dated: boolean } | null>(null);
  const [view, setView] = useState<"weeks" | "months">("weeks");
  const [weeksShown, setWeeksShown] = useState(WEEKS_STEP);
  const [monthsShown, setMonthsShown] = useState(MONTHS_STEP);
  // A past challenge to look at. /progress?challenge=<id> (from Settings) opens on one.
  const [pastId, setPastId] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("challenge")));

  const { items, versions } = checklist.data;
  const loading = mode.loading || checklist.loading || logs.loading;
  const past = useMemo(() => pastChallenges(mode.challenges), [mode.challenges]);
  const viewing = pastId ? (mode.challenges.find((c) => c.id === pastId) ?? null) : null;
  // The challenge on screen: one picked from the past list, else the one in play.
  const shown: Challenge | null = viewing ?? mode.challenge ?? mode.finished;

  const challengeModel = useMemo(() => {
    if (!shown || loading) return null;
    const last = lastDay(shown);
    return buildProgress({
      startDate: shown.start_date,
      lengthDays: shown.length_days,
      streakFrom: start,
      // A closed challenge is read as of its last day, so days it never reached stay blank.
      today: shown.status === "active" || last >= today ? today : last < shown.start_date ? addDays(shown.start_date, -1) : last,
      items: challengeItems(shown, items),
      versions,
      logs: logs.data,
    });
  }, [shown, loading, start, today, items, versions, logs.data]);

  const ongoing = useMemo(() => {
    if (loading) return null;
    const input = { historyStart: start, today, items, versions, logs: logs.data };
    const first30 = addDays(today, -29);
    const windowStart = first30 < start ? start : first30;
    const recent = buildProgress({ startDate: windowStart, lengthDays: 30, streakFrom: start, today, items, versions, logs: logs.data });
    return {
      headline: ongoingHeadline(statusByDate(input), start, today),
      weeks: ongoingWeeks(input, weeksShown + 1),
      months: ongoingMonths(input, monthsShown + 1),
      streaks: recent.streaks,
      rates: recent.rates,
    };
  }, [loading, start, today, items, versions, logs.data, weeksShown, monthsShown]);

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

  if (!ongoing) {
    return (
      <Screen aria-busy="true">
        <PageHeader title="Progress" right={share} />
      </Screen>
    );
  }

  const openChallengeCell = (cell: GridCell) => setOpen({ cell, dated: false });
  const openDatedCell = (cell: GridCell) => setOpen({ cell, dated: true });
  const sheet = open ? (
    <DaySheet cell={open.cell} title={open.dated ? formatDateShort(open.cell.date) : undefined} onClose={() => setOpen(null)} />
  ) : null;

  // ---------- a past challenge ----------
  if (viewing && challengeModel) {
    const h = challengeModel.headline;
    const ran = daysRun(viewing, today);
    return (
      <Screen>
        <header className="pt-3 pb-2">
          <div className="-mx-2.5 mb-1 flex h-11 items-center">
            <button
              type="button"
              onClick={() => {
                setPastId(null);
                window.history.replaceState(null, "", window.location.pathname);
              }}
              aria-label="Back to progress"
              className="pressable inline-flex size-11 items-center justify-center rounded-full text-ink-2"
            >
              <ChevronLeft size={26} aria-hidden />
            </button>
          </div>
          <p className="t-label mb-1.5">Past challenge · {STATUS_LABEL[viewing.status]}</p>
          <h1 className="t-title">{viewing.name}</h1>
          <p className="t-sub mt-1">
            {ran > 0
              ? `${formatDateShort(viewing.start_date)} to ${formatDateShort(lastDay(viewing))}, ${ran} of ${viewing.length_days} days`
              : `Set for ${formatDateShort(viewing.start_date)}. It never ran a day.`}
          </p>
        </header>
        {ran > 0 ? (
          <>
            <Card className="mt-3">
              <div className="grid grid-cols-3 divide-x divide-line">
                {[
                  { label: "Locked in", value: h.lockedIn, tone: h.lockedIn > 0 ? "text-accent" : undefined },
                  { label: "Partial", value: h.partial },
                  { label: "Missed", value: h.missed, tone: h.missed > 0 ? "text-danger" : undefined },
                ].map((x) => (
                  <div key={x.label} className="px-1 text-center">
                    <div className={cn("t-num-sm", x.tone)}>{x.value}</div>
                    <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{x.label}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Section title={`${challengeModel.grid.length} days`}>
              <Grid grid={challengeModel.grid} onOpen={openChallengeCell} />
            </Section>
            {challengeModel.rates.length > 0 ? (
              <Section title="Completion by item" right="Lowest first">
                <Rates rows={challengeModel.rates} />
              </Section>
            ) : null}
          </>
        ) : null}
        <p className="t-sub mt-5 px-1">These days are part of your ongoing history. Closing the challenge changed none of them.</p>
        {sheet}
      </Screen>
    );
  }

  const inPlay = mode.challenge ?? mode.finished;
  const h = challengeModel?.headline ?? null;
  const challengeWeeks = challengeModel ? challengeModel.weeks.filter((w) => w.state !== "future").reverse() : [];
  const noLogsYet = logs.data.length === 0;
  const weeks = ongoing.weeks.slice(0, weeksShown);
  const months = ongoing.months.slice(0, monthsShown);

  return (
    <Screen>
      <PageHeader title="Progress" right={share} />

      {inPlay && challengeModel && h ? (
        <>
          <Numbers h={h} name={inPlay.name} />
          <Section
            title={`${challengeModel.grid.length} days`}
            right={mode.finished ? "Ready to close on Today" : !h.finished ? `${countLabel(h.remaining, "day")} left` : undefined}
          >
            <Grid grid={challengeModel.grid} onOpen={openChallengeCell} />
            {noLogsYet ? (
              <p className="t-sub mt-3 px-1">Nothing logged yet. Check items off on Today and this fills in. Tap a day to see what was hit and what was not.</p>
            ) : null}
          </Section>
        </>
      ) : null}

      {inPlay ? (
        <Section title="Ongoing" right="Never resets">
          <OngoingNumbers h={ongoing.headline} />
        </Section>
      ) : (
        <>
          <OngoingNumbers h={ongoing.headline} />
          {mode.upcoming ? (
            <p className="t-sub mt-3 px-1">
              {mode.upcoming.name} starts {formatDateLong(mode.upcoming.start_date)} and runs to {formatDateShort(plannedEnd(mode.upcoming))}.
            </p>
          ) : null}
          {noLogsYet ? <p className="t-sub mt-3 px-1">Nothing logged yet. Check items off on Today and this fills in.</p> : null}
        </>
      )}

      <Section title="Streaks" right="Slipping first">
        <Streaks rows={challengeModel && inPlay ? challengeModel.streaks : ongoing.streaks} />
      </Section>

      {(inPlay && challengeModel ? challengeModel.rates : ongoing.rates).length > 0 ? (
        <Section title="Completion by item" right={inPlay ? "This challenge" : "Last 30 days"}>
          <Rates rows={inPlay && challengeModel ? challengeModel.rates : ongoing.rates} />
        </Section>
      ) : null}

      {inPlay && challengeModel && challengeWeeks.length > 0 ? (
        <Section title="Challenge weeks">
          <div className="space-y-3">
            {challengeWeeks.map((w) => (
              <WeekCard key={w.weekStart} week={w} grid={challengeModel.grid} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Over time" right={<span className="tnum">{countLabel(ongoing.headline.totalDays, "day")}</span>}>
        <SegmentedControl label="Over time by" options={VIEWS} value={view} onChange={setView} size="sm" />
        <div className="mt-3 space-y-3">
          {view === "weeks"
            ? weeks.map((w) => <OngoingWeekCard key={w.weekStart} week={w} onOpen={openDatedCell} />)
            : months.map((m) => <OngoingMonthCard key={m.key} month={m} onOpen={openDatedCell} />)}
        </div>
        {(view === "weeks" ? ongoing.weeks.length > weeksShown : ongoing.months.length > monthsShown) ? (
          <button
            type="button"
            onClick={() => (view === "weeks" ? setWeeksShown((n) => n + WEEKS_STEP) : setMonthsShown((n) => n + MONTHS_STEP))}
            className="pressable mt-3 h-12 w-full rounded-[14px] border border-line-strong text-[15px] font-semibold text-ink"
          >
            Show earlier {view}
          </button>
        ) : null}
      </Section>

      {past.length > 0 ? (
        <Section title="Past challenges" right={<span className="tnum">{past.length}</span>}>
          <Card padded={false} className="overflow-hidden">
            <ul className="divide-y divide-line">
              {past.map((c) => {
                const ran = daysRun(c, today);
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => setPastId(c.id)} className="pressable flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-medium text-ink">{c.name}</span>
                        <span className="tnum mt-0.5 block truncate text-[13px] text-ink-3">
                          {STATUS_LABEL[c.status]}
                          {ran > 0 ? ` · ${formatDateShort(c.start_date)} to ${formatDateShort(lastDay(c))} · ${countLabel(ran, "day")}` : " · never ran a day"}
                        </span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Section>
      ) : null}

      <Section title="Weekly review">
        <WeeklyReview />
      </Section>

      {sheet}
    </Screen>
  );
}
