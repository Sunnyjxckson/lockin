"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Share } from "lucide-react";
import { BigNumber, Button, Card, CheckMark, EmptyState, IconLink, List, ListRow, PageHeader, ProgressBar, Screen, Section, SegmentedControl, TopBar, TrackStat, cn } from "@/components/ui";
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

const DaySheet = dynamic(() => import("./DaySheet").then((m) => m.DaySheet), { ssr: false });

// ---------- grid ----------

/** One day as a square tile. `dated` cells belong to the ongoing view and are named by their date, not a day count. */
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
        "relative flex aspect-square min-h-11 items-center justify-center rounded-[14px] text-[15px] font-medium tracking-[-0.02em]",
        !future && "pressable",
        cell.kind === "full" && "grad border border-transparent",
        (cell.kind === "partial" || cell.kind === "open") && "tile text-ink",
        cell.kind === "missed" && "tile text-ink-2",
        future && "text-ink-3",
        cell.isToday && "outline outline-[1.5px] outline-offset-2 outline-ink",
      )}
    >
      <span>{cell.day}</span>
      {cell.kind === "partial" ? (
        <span aria-hidden className="absolute bottom-[7px] left-1/2 h-0.5 w-4 -translate-x-1/2 overflow-hidden rounded-full bg-hair">
          <span className="grad-line block h-full rounded-full" style={{ width: `${Math.max(20, cell.percent)}%` }} />
        </span>
      ) : cell.kind === "missed" ? (
        <span aria-hidden className="absolute bottom-[6px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-danger" />
      ) : null}
    </button>
  );
}

function Weekdays() {
  return (
    <div className="mb-2 grid grid-cols-7 gap-1.5" aria-hidden>
      {WEEKDAYS.map((d, i) => (
        <div key={i} className="t-label text-center text-[10px]">
          {d}
        </div>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="t-caption mt-3.5 flex items-center gap-4 px-1 text-ink-2" aria-hidden>
      <span className="inline-flex items-center gap-1.5">
        <span className="grad size-2.5 rounded-[4px]" />
        Full
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="grad-line h-0.5 w-3 rounded-full" />
        Partial
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-1 rounded-full bg-danger" />
        Missed
      </span>
    </div>
  );
}

/** The days of a challenge as a calendar of tiles, straight on the page. */
function Grid({ grid, onOpen }: { grid: GridModel; onOpen: (c: GridCell) => void }) {
  return (
    <div>
      <Weekdays />
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: grid.lead }, (_, i) => (
          <span key={`lead${i}`} aria-hidden />
        ))}
        {grid.cells.map((cell) => (
          <DayCell key={cell.date} cell={cell} onOpen={onOpen} />
        ))}
      </div>
      <Legend />
    </div>
  );
}

function Now() {
  return <span className="t-label text-[10px] text-accent">Now</span>;
}

// ---------- streaks and rates ----------

function streakNote(r: StreakRow): { text: string; cls: string } {
  if (r.health === "broken") return { text: `Lost a run of ${countLabel(r.best, r.unit)}`, cls: "text-warn" };
  if (r.health === "cold") return { text: "Not started", cls: "text-ink-2" };
  if (r.health === "behind") return { text: `Best ${r.best}`, cls: "text-ink-2" };
  return { text: "Best run yet", cls: "text-accent" };
}

/** One row per item: its streak as the number, and its completion rate as the line under the row. */
function Streaks({ rows, rates }: { rows: StreakRow[]; rates: ItemRate[] }) {
  if (rows.length === 0) {
    return (
      <Card padded={false}>
        <EmptyState compact title="Nothing in the checklist" body="Add items in Settings and their streaks show up here." />
      </Card>
    );
  }
  const rateOf = new Map(rates.map((r) => [r.item.id, r]));
  return (
    <ul>
      {rows.map((r) => {
        const note = streakNote(r);
        const rate = rateOf.get(r.item.id);
        return (
          <li key={r.item.id} className="px-1">
            <div className="flex min-h-[60px] items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[15px] text-ink">{r.item.name}</span>
                  {r.item.category === "vice" ? <span className="t-label shrink-0 text-[10px]">Vice</span> : null}
                </span>
                <span className="t-caption mt-0.5 block truncate">
                  <span className={note.cls}>{note.text}</span>
                  {rate ? (
                    <span className="text-ink-2">
                      {rate.rate === null ? ", due this week" : `, ${rate.done} of ${rate.total}${rate.unit === "week" ? " wk" : ""}`}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={cn("t-value", r.current === 0 ? "text-ink-2" : "text-ink")}>{r.current}</span>
                <span className="t-caption ml-1 text-ink-2">{r.unit === "week" ? "wk" : r.current === 1 ? "day" : "days"}</span>
              </span>
            </div>
            <ProgressBar height={2} value={rate?.rate ?? 0} label={`${r.item.name} completion`} />
          </li>
        );
      })}
    </ul>
  );
}

function Rates({ rows }: { rows: ItemRate[] }) {
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.item.id} className="px-1">
          <div className="flex min-h-[52px] items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-[15px] text-ink">{r.item.name}</span>
              <span className="t-caption mt-0.5 block text-ink-2">
                {r.rate === null ? "Due this week" : `${r.done} of ${r.total}${r.unit === "week" ? " wk" : ""}`}
                {r.current ? "" : ", removed"}
              </span>
            </span>
            {r.rate === null ? null : (
              <span className="shrink-0">
                <span className="t-value text-ink">{Math.round(r.rate * 100)}</span>
                <span className="t-caption ml-0.5 text-ink-2">%</span>
              </span>
            )}
          </div>
          <ProgressBar height={2} value={r.rate ?? 0} label={`${r.item.name} completion`} />
        </li>
      ))}
    </ul>
  );
}

// ---------- weeks ----------

function tallyLine(t: { full: number; partial: number; missed: number }): string {
  return `${t.full} full, ${t.partial} partial, ${t.missed} missed`;
}

/** The once a week items under a week. */
function WeeklyItems({ rows, past }: { rows: WeekRollup["weekly"]; past: boolean }) {
  if (rows.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((r) => (
        <li key={r.item.id} className="flex items-center gap-2.5 px-1">
          <CheckMark checked={r.done} size={18} />
          <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{r.item.name}</span>
          <span className={cn("t-caption shrink-0", r.done ? "text-accent" : past ? "text-danger" : "text-ink-2")}>
            {r.done && r.doneOn ? formatDateShort(r.doneOn) : past ? "Missed" : "By Sunday"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WeekRow({ week, grid }: { week: WeekRollup; grid: GridModel }) {
  const cells = grid.cells.filter((c) => c.date >= week.from && c.date <= week.to);
  return (
    <div className="px-1 py-4 first:pt-0">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="t-h2">Week {week.index}</span>
            {week.state === "current" ? <Now /> : null}
          </div>
          <div className="t-caption mt-1 text-ink-2">
            {formatDateShort(week.from)} to {formatDateShort(week.to)}
            <span className="sr-only">. {tallyLine(week)}</span>
          </div>
        </div>
        <div className="shrink-0">
          <span className="t-stat text-ink">{week.percent ?? 0}</span>
          <span className="t-caption ml-0.5 text-ink-2">%</span>
        </div>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {cells.map((c) => (
          <span
            key={c.date}
            className={cn(
              "h-[3px] flex-1 rounded-full",
              c.kind === "full" && "grad-line",
              c.kind === "partial" && "bg-ink-3",
              c.kind === "missed" && "bg-danger",
              (c.kind === "open" || c.kind === "future" || c.kind === "before") && "bg-hair",
            )}
          />
        ))}
      </div>
      <WeeklyItems rows={week.weekly} past={week.state === "past"} />
    </div>
  );
}

// ---------- ongoing ----------

function OngoingStats({ h, withWindow }: { h: OngoingHeadline; withWindow: boolean }) {
  const c = h.last30;
  return (
    <div data-ongoing-numbers>
      {withWindow ? <p className="t-sub mb-4 px-1">{c.days === 0 ? "Today is the first day." : `${consistencyLabel(c)} were full.`}</p> : null}
      <div className="grid grid-cols-4 gap-3.5 px-1">
        <TrackStat label="Last 7" value={h.last7.days > 0 ? `${h.last7.full}/${h.last7.days}` : "0"} progress={h.last7.days > 0 ? h.last7.full / h.last7.days : 0} />
        <TrackStat label="In a row" value={h.fullStreak} progress={h.bestFullStreak > 0 ? h.fullStreak / h.bestFullStreak : 0} />
        <TrackStat label="Best run" value={h.bestFullStreak} />
        <TrackStat label="All time" value={h.fullDays} />
      </div>
    </div>
  );
}

function OngoingWeekRow({ week, onOpen }: { week: OngoingWeek; onOpen: (c: GridCell) => void }) {
  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[15px] text-ink">{week.label}</span>
          {week.state === "current" ? <Now /> : null}
          <span className="sr-only">{tallyLine(week)}</span>
        </div>
        <div className="shrink-0">
          <span className={cn("t-value", week.percent === 100 ? "text-accent" : "text-ink")}>{week.full}</span>
          <span className="t-caption text-ink-2">/{week.days}</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {week.cells.map((cell) => (
          <DayCell key={cell.date} cell={cell} dated onOpen={onOpen} />
        ))}
      </div>
      <WeeklyItems rows={week.weekly} past={week.state === "past"} />
    </div>
  );
}

function OngoingMonthBlock({ month, onOpen }: { month: OngoingMonth; onOpen: (c: GridCell) => void }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <div className="min-w-0">
          <span className="t-h2">{month.label}</span>
          <span className="sr-only">{tallyLine(month)}</span>
        </div>
        <div className="shrink-0">
          <span className={cn("t-value", month.percent === 100 ? "text-accent" : "text-ink")}>{month.full}</span>
          <span className="t-caption text-ink-2">/{month.days}</span>
        </div>
      </div>
      <Weekdays />
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: month.lead }, (_, i) => (
          <span key={`lead${i}`} aria-hidden />
        ))}
        {month.cells.map((cell) => (
          <DayCell key={cell.date} cell={cell} dated onOpen={onOpen} />
        ))}
      </div>
    </div>
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
    <IconLink href="/progress/card" label="Share card">
      <Share size={20} strokeWidth={1.75} aria-hidden />
    </IconLink>
  );

  if (!ongoing) {
    return (
      <Screen aria-busy="true">
        <TopBar title="Record" right={share} />
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
        <PageHeader
          title={viewing.name}
          eyebrow={`Past challenge · ${STATUS_LABEL[viewing.status]}`}
          subtitle={
            ran > 0
              ? `${formatDateShort(viewing.start_date)} to ${formatDateShort(lastDay(viewing))}, ${ran} of ${viewing.length_days} days`
              : `Set for ${formatDateShort(viewing.start_date)}. It never ran a day.`
          }
          backLabel="Back to record"
          onBack={() => {
            setPastId(null);
            window.history.replaceState(null, "", window.location.pathname);
          }}
        />
        {ran > 0 ? (
          <div className="animate-fade-in">
            <div className="mt-3 grid grid-cols-3 gap-3.5 px-1">
              <TrackStat label="Locked in" value={h.lockedIn} progress={ran > 0 ? h.lockedIn / ran : 0} />
              <TrackStat label="Partial" value={h.partial} />
              <TrackStat label="Missed" value={h.missed} />
            </div>
            <Section title={`${challengeModel.grid.length} days`}>
              <Grid grid={challengeModel.grid} onOpen={openChallengeCell} />
            </Section>
            {challengeModel.rates.length > 0 ? (
              <Section title="Completion by item" right="Lowest first">
                <Rates rows={challengeModel.rates} />
              </Section>
            ) : null}
          </div>
        ) : null}
        <p className="t-sub mt-7 px-1">These days stay in your ongoing history.</p>
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
  const inChallenge = !!(inPlay && challengeModel && h);
  const streaks = inChallenge && challengeModel ? challengeModel.streaks : ongoing.streaks;
  const rates = inChallenge && challengeModel ? challengeModel.rates : ongoing.rates;
  // Items that were scored but are no longer in the checklist have a rate and no streak.
  const streakIds = new Set(streaks.map((r) => r.item.id));
  const otherRates = rates.filter((r) => !streakIds.has(r.item.id));
  const c = ongoing.headline.last30;
  const status = inChallenge && h ? (mode.finished ? "Ready to close" : h.finished ? "Done" : `${countLabel(h.remaining, "day")} left`) : "Ongoing";

  const overTime = (
    <Section title="Over time" right={countLabel(ongoing.headline.totalDays, "day")}>
      <SegmentedControl label="Over time by" options={VIEWS} value={view} onChange={setView} size="sm" />
      <div className={cn("mt-5", view === "weeks" ? "space-y-6" : "space-y-8")}>
        {view === "weeks"
          ? weeks.map((w) => <OngoingWeekRow key={w.weekStart} week={w} onOpen={openDatedCell} />)
          : months.map((m) => <OngoingMonthBlock key={m.key} month={m} onOpen={openDatedCell} />)}
      </div>
      {(view === "weeks" ? ongoing.weeks.length > weeksShown : ongoing.months.length > monthsShown) ? (
        <Button variant="secondary" full className="mt-6" onClick={() => (view === "weeks" ? setWeeksShown((n) => n + WEEKS_STEP) : setMonthsShown((n) => n + MONTHS_STEP))}>
          Show earlier {view}
        </Button>
      ) : null}
    </Section>
  );

  return (
    <Screen>
      <TopBar title="Record" right={<><span>{status}</span>{share}</>} />

      <div className="animate-fade-in">
        {inChallenge && challengeModel && h && inPlay ? (
          <>
            <section className="pt-5" aria-label="Challenge">
              <BigNumber
                label={`${inPlay.name}, ${h.finished ? "done" : "day"}`}
                value={h.day}
                unit={`of ${h.length}`}
                sub={noLogsYet ? "Nothing logged yet. Tick things off on Today." : `${h.percent}% of everything done so far.`}
              />
              <ProgressBar className="mt-4" value={h.percent / 100} label="Overall completion" />
            </section>

            <section className="mt-7" aria-label={`${challengeModel.grid.length} days`}>
              <Grid grid={challengeModel.grid} onOpen={openChallengeCell} />
            </section>

            <div className="mt-7 grid grid-cols-4 gap-3.5 px-1">
              <TrackStat label="Locked in" value={h.lockedIn} progress={h.length > 0 ? h.lockedIn / h.length : 0} />
              <TrackStat label="Partial" value={h.partial} />
              <TrackStat label="Missed" value={h.missed} />
              <TrackStat label="Left" value={h.remaining} />
            </div>

            <Section title="Ongoing" right="Never resets">
              <OngoingStats h={ongoing.headline} withWindow />
            </Section>
          </>
        ) : (
          <>
            <section className="pt-5" aria-label="Consistency">
              <BigNumber
                label={c.days < c.window ? "Days locked in" : `Last ${c.window} days`}
                value={c.full}
                unit={`of ${c.days}`}
                sub={
                  mode.upcoming
                    ? `${mode.upcoming.name} starts ${formatDateShort(mode.upcoming.start_date)}, to ${formatDateShort(plannedEnd(mode.upcoming))}.`
                    : noLogsYet
                      ? "Nothing logged yet. Tick things off on Today."
                      : c.days === 0
                        ? "Today is the first day."
                        : `${c.percent}% of days were full.`
                }
              />
              <ProgressBar className="mt-4" value={c.days > 0 ? c.full / c.days : 0} label="Full days out of the days counted" />
            </section>
            <div className="mt-7">
              <OngoingStats h={ongoing.headline} withWindow={false} />
            </div>
            {overTime}
          </>
        )}

        <Section title="Streaks" right="Slipping first">
          <Streaks rows={streaks} rates={rates} />
        </Section>

        {otherRates.length > 0 ? (
          <Section title="Removed items" right={inChallenge ? "This challenge" : "Last 30 days"}>
            <Rates rows={otherRates} />
          </Section>
        ) : null}

        {inChallenge && challengeModel && challengeWeeks.length > 0 ? (
          <Section title="Challenge weeks">
            <div className="divide-y divide-hair">
              {challengeWeeks.map((w) => (
                <WeekRow key={w.weekStart} week={w} grid={challengeModel.grid} />
              ))}
            </div>
          </Section>
        ) : null}

        {inChallenge ? overTime : null}

        {past.length > 0 ? (
          <Section title="Past challenges" right={past.length}>
            <List>
              {past.map((p) => {
                const ran = daysRun(p, today);
                return (
                  <ListRow
                    key={p.id}
                    title={p.name}
                    sub={`${STATUS_LABEL[p.status]}${ran > 0 ? ` · ${formatDateShort(p.start_date)} to ${formatDateShort(lastDay(p))} · ${countLabel(ran, "day")}` : " · never ran a day"}`}
                    onClick={() => setPastId(p.id)}
                  />
                );
              })}
            </List>
          </Section>
        ) : null}

        <Section title="Weekly review">
          <WeeklyReview />
        </Section>
      </div>

      {sheet}
    </Screen>
  );
}
