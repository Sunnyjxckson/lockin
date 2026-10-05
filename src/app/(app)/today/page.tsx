"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronRight, Flag, Lock, MessageSquareText, ShieldBan } from "lucide-react";
import { Button, ButtonLink, Card, EmptyState, GlassCard, IconLink, Notice, ProgressBar, Screen, Section, SectionLabel, TopBar, TrackStat, cn, useToast } from "@/components/ui";
import { finishChallenge, logWeight, setChecked, setText, setValue, workoutsFor } from "@/lib/db/helpers";
import { useChecklist, useDay, useDayBlocks, useInstalledOn, useList, useLogs, useMode, useNow, useSettings, useWorkouts } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { challengeDay, challengeRecord, consistency, consistencyLabel, plannedEnd, ranOn } from "@/lib/logic/challenge";
import {
  addDays,
  dateRange,
  dayNumber,
  formatDateFull,
  formatDateLong,
  formatDateShort,
  formatTime,
  isDateStr,
  isDayEditable,
  lockInstant,
  nyParts,
  weekdayOf,
} from "@/lib/logic/dates";
import { summarizeDay, type DayStatus, type ItemResult, type WeeklyResult } from "@/lib/logic/day";
import { allStreaks, fullDayStreak } from "@/lib/logic/streaks";
import { TRACK_LABEL, greetingLines, orderByTrack, shortName, shortTarget, summarizeTracks, trackOf } from "@/lib/logic/tracks";
import type { Challenge, DateStr, Track } from "@/lib/types";
import { SetupRow } from "@/components/app/SetupRow";
import BodyTodaySlot from "@/features/body/TodaySlot";
import { BoardEntry } from "@/features/boards/TodayEntry";
import CoachTodaySlot from "@/features/coach/TodaySlot";
import { FocusAction } from "@/features/focus/TodaySlot";
import { EarnedAction } from "@/features/money/TodaySlot";
import ScheduleTodaySlot from "@/features/schedule/TodaySlot";
import VicesTodaySlot from "@/features/vices/TodaySlot";
import { ChecklistTile, LinkedNumberTile } from "./ChecklistTiles";
import { DayComplete } from "./DayComplete";
import { DayStrip, type StripDay } from "./DayStrip";
import { NowNext } from "./NowNext";
import { KIND_LABEL, WorkoutCard } from "./WorkoutCard";

// Opens from the header. Loaded on first use so it costs Today nothing.
const MoreSheet = dynamic(() => import("@/components/app/MoreSheet").then((m) => m.MoreSheet), { ssr: false });
const ChallengeComplete = dynamic(() => import("./ChallengeComplete").then((m) => m.ChallengeComplete), { ssr: false });

/** How far back Today reads logs. Streaks on the rows count at most this many days. */
const HISTORY_WINDOW = 400;
/** Days on the strip in ongoing mode. */
const STRIP_DAYS = 14;

export default function TodayPage() {
  const toast = useToast();
  const now = useNow(20_000);
  const mode = useMode();
  const today = mode.today;
  const installedOn = useInstalledOn();
  const settings = useSettings();
  const [moreOpen, setMoreOpen] = useState(false);
  // The four tracks are also a filter: tap one and the grid shows only its tiles.
  const [only, setOnly] = useState<Track | null>(null);
  // The strip of earlier days stays folded away until it is asked for, or a day other than today is open.
  const [stripOpen, setStripOpen] = useState(false);
  const [finished, setFinished] = useState<{ challenge: Challenge; full: number } | null>(null);
  const [finishing, setFinishing] = useState(false);

  // The day on screen. Null means "follow today". /today?date=YYYY-MM-DD
  // (Progress links here) opens on that day. The page only renders in the
  // browser, after the passcode gate, so the address can be read up front.
  const [picked, setPicked] = useState<DateStr | null>(() => {
    const d = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("date");
    return d && isDateStr(d) ? d : null;
  });
  useEffect(() => {
    // Drop the param once read, so a reload or a later visit follows today again.
    if (window.location.search.includes("date=")) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // The ongoing history runs from `start` to today, whatever challenge is or
  // is not on top of it. Any day in it can be opened.
  const c = mode.challenge;
  const start = mode.historyStart;
  const date = picked && picked >= start && picked <= today ? picked : today;
  const isToday = date === today;
  const readFrom = addDays(today, -HISTORY_WINDOW) > start ? addDays(today, -HISTORY_WINDOW) : start;

  const day = useDay(date);
  const checklist = useChecklist();
  const history = useLogs(readFrom, today);
  const blocks = useDayBlocks(today);
  const workouts = useWorkouts();
  const meals = useList("meal", { eq: { date } });

  // The strip: the challenge's days while one runs (plus yesterday when the
  // challenge started today, so it can still be finished off), otherwise the
  // last two weeks.
  const strip = useMemo<StripDay[]>(() => {
    const plain = (d: DateStr): StripDay => ({ date: d, label: String(Number(d.slice(8))), name: formatDateLong(d) });
    if (c) {
      const before = addDays(c.start_date, -1);
      const lead = today === c.start_date && before >= start ? [plain(before)] : [];
      const days = dateRange(c.start_date, plannedEnd(c)).map((d): StripDay => {
        const n = dayNumber(c.start_date, d);
        return { date: d, label: String(n), name: `Day ${n}` };
      });
      return [...lead, ...days];
    }
    const first = addDays(today, -(STRIP_DAYS - 1));
    const days = dateRange(first < start ? start : first, today).map(plain);
    return days.some((d) => d.date === date) ? days : [plain(date), ...days];
  }, [c, start, today, date]);

  // Day status for the strip and for the last 30 days, which is what the
  // ongoing header counts.
  const statusByDate = useMemo(() => {
    const out: Record<DateStr, DayStatus> = {};
    if (checklist.loading || history.loading) return out;
    // Days of the challenge in play (running, or waiting to be closed) are
    // scored by its own items. Every other day by the whole checklist.
    const scope = c ?? mode.finished;
    const first = [addDays(today, -45), strip[0]?.date ?? today, mode.finished?.start_date ?? today].sort()[0];
    for (const d of dateRange(first < readFrom ? readFrom : first, today)) {
      const s = summarizeDay(d, checklist.data.items, checklist.data.versions, history.data);
      out[d] = scope && ranOn(scope, d) ? challengeDay(scope, s).status : s.status;
    }
    if (!(date in out) && date >= readFrom) out[date] = summarizeDay(date, checklist.data.items, checklist.data.versions, history.data).status;
    return out;
  }, [strip, today, date, readFrom, c, mode.finished, checklist.loading, checklist.data, history.loading, history.data]);

  const streaks = useMemo(
    () => (checklist.loading || history.loading ? {} : allStreaks(checklist.data.items, checklist.data.versions, history.data, today, readFrom)),
    [checklist.loading, checklist.data, history.loading, history.data, today, readFrom],
  );

  // The bigger moment when the last item of a day lands.
  const [moment, setMoment] = useState<DateStr | null>(null);
  const endMoment = useCallback(() => setMoment(null), []);
  const seen = useRef<{ date: DateStr; status: DayStatus } | null>(null);
  const status = day.summary?.status ?? null;
  useEffect(() => {
    if (!status) return;
    const prev = seen.current;
    seen.current = { date, status };
    if (prev && prev.date === date && prev.status !== "full" && status === "full") {
      haptics.celebrate();
      setMoment(date);
    }
  }, [date, status]);

  // First paint: wait until everything above the fold has been read, then
  // show the whole screen at once, so nothing jumps as parts arrive. After
  // that (changing day, edits) parts update in place.
  const loaded = !mode.loading && !day.loading && !blocks.loading && !workouts.loading && !history.loading && !settings.loading;
  const [shown, setShown] = useState(false);
  if (loaded && !shown) setShown(true);
  if (!shown) return <Screen aria-busy="true">{null}</Screen>;

  const initial = (settings.data?.display_name ?? "").trim().charAt(0).toUpperCase();
  const topBar = (
    <TopBar
      as="p"
      title="Lock In"
      right={
        <>
          <IconLink href="/coach" label="Coach">
            <MessageSquareText size={20} strokeWidth={1.75} aria-hidden />
          </IconLink>
          <IconLink href="/vices" label="Vices">
            <ShieldBan size={20} strokeWidth={1.75} aria-hidden />
          </IconLink>
          {/* The round gradient mark, as on the approved mockup, opens everything that is not a tab. */}
          <button
            type="button"
            aria-label="More"
            title="More"
            aria-haspopup="dialog"
            onClick={() => {
              haptics.tap();
              setMoreOpen(true);
            }}
            className="pressable inline-flex size-11 items-center justify-center rounded-full"
          >
            <span className="grad flex size-[30px] items-center justify-center rounded-full text-[12px] font-medium tracking-normal normal-case" aria-hidden>
              {initial || "L"}
            </span>
          </button>
        </>
      }
    />
  );

  // Day X of N only while the day on screen is one of the running challenge's
  // days. Every other day is a plain date.
  const inChallenge = !!c && ranOn(c, date);
  const n = inChallenge && c ? dayNumber(c.start_date, date) : null;
  const steady = consistency(statusByDate, today, start, 30);
  const dayTitle = n !== null ? `Day ${n}` : formatDateShort(date);
  const editable = isDayEditable(date, now, installedOn);
  const summary = day.summary;
  const week = day.week;
  const percent = summary?.percent ?? 0;
  const lockAt = nyParts(lockInstant(date, installedOn));
  const w = workoutsFor(workouts.data, weekdayOf(date));

  const scoped = c && inChallenge && c.rules && summary ? challengeDay(c, summary) : null;

  // A challenge whose last day has passed waits here to be closed. Closing it
  // only marks the challenge. The history under it stays as it is.
  const closing = mode.finished;
  const closingRecord = closing ? challengeRecord(closing, statusByDate, today) : null;
  const finish = async () => {
    if (!closing) return;
    setFinishing(true);
    try {
      const full = closingRecord?.full ?? 0;
      await finishChallenge(today);
      haptics.celebrate();
      setFinished({ challenge: closing, full });
    } catch {
      toast("Could not close the challenge", { kind: "error" });
    } finally {
      setFinishing(false);
    }
  };

  const refuse = () => {
    haptics.error();
    toast("This day is locked", { kind: "error" });
  };

  // What a workout tile says: the kind of session as the big line, its name under it.
  const workoutLines = (key: string | null): { value?: string; sub?: string } => {
    if (key === "workout" && w.main) return { value: KIND_LABEL[w.main.kind], sub: w.main.name };
    if (key === "core" && w.core) return { sub: w.core.detail ?? w.core.name.replace(/^Core:\s*/i, "").replace(/^./, (ch) => ch.toUpperCase()) };
    return {};
  };

  // Earnings go in through quick add, so the earning table stays the source
  // of the day's total. Calories and protein take a typed number until a meal
  // is logged that day. After that the totals come from the meals.
  const dailyTile = (r: ItemResult) => {
    if (r.item.key === "earned" && !(r.log && (r.log.slips ?? 0) > 0)) {
      return <EarnedAction key={r.item.id} date={date} value={r.log?.value ?? null} done={r.done} label={shortTarget(r.target, r.item.unit)} disabled={!editable} />;
    }
    const props = {
      item: r.item,
      target: r.target,
      log: r.log,
      state: r.state,
      streak: streaks[r.item.id]?.current,
      disabled: !editable,
      onCheck: (v: boolean) => {
        if (!editable) return refuse();
        void setChecked(r.item.id, date, v);
        // The wake check only counts before its cutoff on the day itself. Say so when a tick lands late.
        if (v && isToday && r.target.kind === "check_by" && nyParts(now).time > r.target.by) toast("Checked after the cutoff. Does not count.");
      },
      onValue: (v: number | null) => (editable ? void setValue(r.item.id, date, v) : refuse()),
      onText: (t: string) => (editable ? void setText(r.item.id, date, t) : refuse()),
      ...workoutLines(r.item.key),
    };
    if ((r.item.key === "calories" || r.item.key === "protein") && meals.data.length > 0) return <LinkedNumberTile key={r.item.id} {...props} href="/body" from="meals" />;
    // The focus timer feeds the study item: a way in while idle, the clock while it runs.
    const corner = r.item.key === "study" && r.item.type === "yesno" && isToday ? <FocusAction runningOnly={!editable} /> : undefined;
    return <ChecklistTile key={r.item.id} {...props} corner={corner} />;
  };

  // Weekly items: done on any day of the week counts. A change goes to the
  // day it was logged on, or to the day on screen when it is new.
  const weeklyTile = (r: WeeklyResult) => {
    const target = r.doneOn ?? r.log?.date ?? date;
    const canEdit = isDayEditable(target, now, installedOn);
    const elsewhere = r.done && r.doneOn !== date;
    return (
      <ChecklistTile
        key={r.item.id}
        item={r.item}
        target={r.target}
        log={r.log}
        state={r.done ? "done" : r.log && (r.log.checked || r.log.value !== null) ? "off" : "open"}
        streak={streaks[r.item.id]?.current}
        sub={r.done ? (elsewhere ? `Done ${formatDateShort(r.doneOn as DateStr)}` : "Done this week") : r.item.type === "number" ? shortName(r.item) : undefined}
        disabled={!canEdit}
        onCheck={(v) => (canEdit ? void setChecked(r.item.id, target, v) : refuse())}
        onValue={(v) => {
          if (!canEdit) return refuse();
          if (r.item.key === "weighin") void logWeight(target, v);
          else void setValue(r.item.id, target, v);
        }}
        onText={(t) => (canEdit ? void setText(r.item.id, target, t) : refuse())}
      />
    );
  };

  const tracks = summary ? summarizeTracks(summary.items, streaks) : [];
  const filter = only && tracks.some((t) => t.track === only) ? only : null;
  const ordered = summary ? orderByTrack(summary.items) : [];
  const visible = filter ? ordered.filter((r) => trackOf(r.item) === filter) : ordered;
  const visibleDone = visible.filter((r) => r.done).length;

  // The opening lines: a greeting on today, the date itself on any other day.
  const dateFull = formatDateFull(date);
  const lines = isToday ? greetingLines(nyParts(now).hour, settings.data?.display_name) : [`${dateFull.split(", ")[0]},`, `${dateFull.split(", ")[1]}.`];
  const stripShown = stripOpen || !isToday;

  return (
    <Screen>
      {topBar}

      <header className="pt-4" data-today={date}>
        <h1 className="t-greeting">
          {lines.map((line, i) => (
            <span key={i} className="block">
              {line}
            </span>
          ))}
        </h1>
        <button
          type="button"
          aria-expanded={stripShown}
          aria-controls="day-strip"
          onClick={() => {
            haptics.tap();
            setStripOpen((v) => !v);
          }}
          className="t-sub pressable -mb-1 mt-1 flex min-h-11 w-full items-center gap-1.5 text-left"
        >
          <span data-day-line>
            {isToday ? `${dateFull}. ` : ""}
            {n !== null && c ? (
              `Day ${n} of ${c.length_days}.`
            ) : (
              <>
                <span data-consistency>{steady.days === 0 ? "First day. Keep it going" : `${consistencyLabel(steady)} locked in`}</span>.
              </>
            )}
          </span>
          <ChevronDown size={15} className={cn("shrink-0 transition-transform duration-200", stripShown && "rotate-180")} aria-hidden />
          <span className="sr-only">{stripShown ? "Hide earlier days" : "Show earlier days"}</span>
        </button>
        {scoped && c ? (
          <p className="t-sub tnum">
            {c.name}: {scoped.done} of {scoped.total}
          </p>
        ) : null}
      </header>

      {stripShown ? (
        <div className="mt-2">
          <DayStrip id="day-strip" days={strip} today={today} selected={date} statusByDate={statusByDate} onSelect={setPicked} label={c ? "Challenge days" : "Recent days"} />
        </div>
      ) : null}

      {closing && closingRecord && isToday ? (
        <GlassCard className="mt-4">
          <p className="t-label text-accent">Challenge done</p>
          <p className="t-h2 mt-2">
            {closing.name}: all {closing.length_days} {closing.length_days === 1 ? "day" : "days"} are behind you.
          </p>
          <p className="t-sub mt-2">
            {closingRecord.full} full, {closingRecord.partial} partial, {closingRecord.missed} missed. Closing it keeps every day you logged.
          </p>
          <div className="mt-4 flex gap-2.5">
            <Button full loading={finishing} icon={<Flag size={17} aria-hidden />} onClick={() => void finish()}>
              Finish challenge
            </Button>
            <ButtonLink href="/progress" variant="secondary">
              Review
            </ButtonLink>
          </div>
        </GlassCard>
      ) : null}

      {mode.upcoming && isToday ? (
        <Link href="/settings/challenge" className="pressable mt-4 block rounded-[20px]">
          <Notice action={<ChevronRight size={16} className="mr-2 text-ink-3" aria-hidden />}>
            {mode.upcoming.name} starts {formatDateLong(mode.upcoming.start_date)}
          </Notice>
        </Link>
      ) : null}

      {!editable ? (
        <Notice className="mt-4" icon={<Lock size={15} aria-hidden />}>
          Locked. Days close at noon the next day.
        </Notice>
      ) : !isToday ? (
        <Notice
          className="mt-4"
          action={
            <Button variant="ghost" size="sm" className="px-3 text-ink" onClick={() => setPicked(null)}>
              Back to today
            </Button>
          }
        >
          Open until {formatDateShort(lockAt.date)}, {formatTime(lockAt.time)}
        </Notice>
      ) : null}

      {isToday ? (
        <div className="mt-4 flex flex-col gap-3">
          <CoachTodaySlot className="-my-2" />
          <NowNext blocks={blocks.data} now={now} loading={blocks.loading} />
          <ScheduleTodaySlot date={date} />
        </div>
      ) : null}

      {tracks.length > 0 ? (
        <div role="group" aria-label="The day in four tracks" className="mt-6 grid gap-3.5 px-1" style={{ gridTemplateColumns: `repeat(${tracks.length}, minmax(0, 1fr))` }}>
          {tracks.map((t) => (
            <TrackStat
              key={t.track}
              value={t.value}
              label={t.label}
              progress={t.progress}
              attention={t.attention}
              pressed={filter === t.track}
              aria-label={`${t.label}: ${t.done} of ${t.total} done${t.attention ? ", needs a look" : ""}. ${filter === t.track ? "Show everything" : "Show only these"}`}
              onClick={() => {
                haptics.tap();
                setOnly(filter === t.track ? null : t.track);
              }}
            />
          ))}
        </div>
      ) : null}

      <section className="mt-6" aria-label="Checklist">
        <SectionLabel
          right={
            summary ? (
              <span className="tnum" data-count>
                {filter ? `${visibleDone} of ${visible.length}` : `${summary.done} of ${summary.total}`}
              </span>
            ) : null
          }
        >
          {filter ? TRACK_LABEL[filter] : isToday ? "Today" : "That day"}
        </SectionLabel>
        <ProgressBar value={percent / 100} height={2} label="Checklist done" className="mt-2.5" />
        <div className="mt-3">
          {!summary ? (
            <Card className="h-[350px]" aria-busy="true" />
          ) : summary.items.length === 0 ? (
            <Card padded={false}>
              <EmptyState
                compact
                title="Nothing on the checklist"
                body="Add the items you want to hold yourself to."
                action={
                  <Link href="/settings/checklist" className="text-[14px] text-ink underline decoration-hair underline-offset-4">
                    Edit checklist
                  </Link>
                }
              />
            </Card>
          ) : (
            <div key={date} className="grid grid-cols-3 gap-2.5">
              {visible.map(dailyTile)}
            </div>
          )}
        </div>
        <div className="mt-1 flex min-h-11 items-center justify-between">
          {isToday && editable ? <VicesTodaySlot /> : <span />}
          {filter ? (
            <button type="button" onClick={() => setOnly(null)} className="pressable min-h-11 px-1 text-[13px] text-ink-2 underline decoration-hair underline-offset-4">
              Show all {summary?.total ?? ""}
            </button>
          ) : null}
        </div>
      </section>

      {week && week.items.length > 0 ? (
        <Section title="This week" right={<span className="tnum">{week.done} of {week.total}</span>} className="!mt-3">
          <div key={date} className="grid grid-cols-3 gap-2.5">
            {week.items.map(weeklyTile)}
          </div>
        </Section>
      ) : null}

      {isToday ? <SetupRow className="mt-7" /> : null}

      <Section title={isToday ? "Today's workout" : "Workout"} right={isToday ? <BodyTodaySlot /> : null}>
        {workouts.loading ? (
          <Card className="h-[240px]" aria-busy="true" />
        ) : !w.main && !w.core ? (
          <Card padded={false}>
            <EmptyState compact title="No workout set" body="Pick exercises for this weekday in Settings." />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {w.main ? <WorkoutCard workout={w.main} /> : null}
            {w.core ? <WorkoutCard workout={w.core} tag="Core" /> : null}
          </div>
        )}
      </Section>

      {/* The why, under everything that gets checked off, so it never sits between the user and the list. */}
      {isToday ? <BoardEntry className="mt-7" /> : null}

      {moment === date && summary ? (
        <DayComplete title={dayTitle} total={summary.total} streak={fullDayStreak(statusByDate, today, start)} isToday={isToday} onDone={endMoment} />
      ) : null}

      {moreOpen ? <MoreSheet onClose={() => setMoreOpen(false)} /> : null}
      {finished ? <ChallengeComplete challenge={finished.challenge} full={finished.full} onDone={() => setFinished(null)} /> : null}
    </Screen>
  );
}
