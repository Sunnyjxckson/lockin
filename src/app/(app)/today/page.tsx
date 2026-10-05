"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronRight, Ellipsis, Flag, Lock, MessageSquareText, ShieldBan } from "lucide-react";
import { Button, Card, EmptyState, ProgressRing, Screen, Section, cn, useToast } from "@/components/ui";
import { finishChallenge, logWeight, setChecked, setText, setValue, workoutsFor } from "@/lib/db/helpers";
import { useChecklist, useDay, useDayBlocks, useInstalledOn, useList, useLogs, useMode, useNow, useWorkouts } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { challengeDay, challengeRecord, consistency, consistencyLabel, plannedEnd, ranOn } from "@/lib/logic/challenge";
import {
  addDays,
  dateRange,
  dayNumber,
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
import { WEEKDAY_NAMES, type Challenge, type ChecklistItem, type DateStr } from "@/lib/types";
import { SetupRow } from "@/components/app/SetupRow";
import BodyTodaySlot from "@/features/body/TodaySlot";
import CoachTodaySlot from "@/features/coach/TodaySlot";
import { EarnedAction } from "@/features/money/TodaySlot";
import ScheduleTodaySlot from "@/features/schedule/TodaySlot";
import VicesTodaySlot from "@/features/vices/TodaySlot";
import { ChecklistRow } from "./ChecklistRows";
import { DayComplete } from "./DayComplete";
import { DayStrip, type StripDay } from "./DayStrip";
import { NowNext } from "./NowNext";
import { WorkoutCard } from "./WorkoutCard";

// Opens from the header. Loaded on first use so it costs Today nothing.
const MoreSheet = dynamic(() => import("@/components/app/MoreSheet").then((m) => m.MoreSheet), { ssr: false });
const ChallengeComplete = dynamic(() => import("./ChallengeComplete").then((m) => m.ChallengeComplete), { ssr: false });

/** How far back Today reads logs. Streaks on the rows count at most this many days. */
const HISTORY_WINDOW = 400;
/** Days on the strip in ongoing mode. */
const STRIP_DAYS = 14;

function HeaderLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="pressable inline-flex size-11 items-center justify-center rounded-full text-ink-2"
    >
      {children}
    </Link>
  );
}

export default function TodayPage() {
  const toast = useToast();
  const now = useNow(20_000);
  const mode = useMode();
  const today = mode.today;
  const installedOn = useInstalledOn();
  const [moreOpen, setMoreOpen] = useState(false);
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
  const [glow, setGlow] = useState(0);
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
      setGlow((n) => n + 1);
      setMoment(date);
    }
  }, [date, status]);

  // First paint: wait until everything above the fold has been read, then
  // show the whole screen at once, so nothing jumps as parts arrive. After
  // that (changing day, edits) parts update in place.
  const loaded = !mode.loading && !day.loading && !blocks.loading && !workouts.loading && !history.loading;
  const [shown, setShown] = useState(false);
  if (loaded && !shown) setShown(true);
  if (!shown) return <Screen aria-busy="true">{null}</Screen>;

  const topBar = (
    <div className="-mx-2.5 flex h-12 items-center justify-between pt-1">
      <span className="t-label pl-2.5 text-ink-2">Lock In</span>
      <div className="flex items-center">
        <HeaderLink href="/coach" label="Coach">
          <MessageSquareText size={22} aria-hidden />
        </HeaderLink>
        <HeaderLink href="/vices" label="Vices">
          <ShieldBan size={22} aria-hidden />
        </HeaderLink>
        <button
          type="button"
          aria-label="More"
          title="More"
          aria-haspopup="dialog"
          onClick={() => {
            haptics.tap();
            setMoreOpen(true);
          }}
          className="pressable inline-flex size-11 items-center justify-center rounded-full text-ink-2"
        >
          <Ellipsis size={24} aria-hidden />
        </button>
      </div>
    </div>
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

  const subFor = (item: ChecklistItem): string | undefined => {
    if (item.key === "workout" && w.main) return w.main.detail ? `${w.main.name}, ${w.main.detail.toLowerCase()}` : w.main.name;
    if (item.key === "core" && w.core) return w.core.name.replace(/^Core:\s*/i, "").replace(/^./, (ch) => ch.toUpperCase()) + (w.core.detail ? `, ${w.core.detail.toLowerCase()}` : "");
    return undefined;
  };

  // Earnings go in through quick add, so the earning table stays the source
  // of the day's total. Calories and protein take a typed number until a meal
  // is logged that day. After that the totals come from the meals.
  const actionFor = (r: ItemResult) => {
    if (r.item.key === "earned") return <EarnedAction date={date} value={r.log?.value ?? null} done={r.done} disabled={!editable} />;
    if ((r.item.key === "calories" || r.item.key === "protein") && meals.data.length > 0) {
      return (
        <Link
          href="/body"
          aria-label={`${r.item.name}: ${(r.log?.value ?? 0).toLocaleString("en-US")}${r.item.unit ?? ""} from meals. Open Body`}
          className={cn(
            "pressable tnum flex h-11 shrink-0 items-center gap-1 rounded-[12px] border pr-1.5 pl-3 text-[19px] font-semibold tracking-[-0.02em]",
            r.done ? "border-accent-line bg-accent-soft text-accent" : "border-line bg-surface-2 text-ink",
          )}
        >
          {(r.log?.value ?? 0).toLocaleString("en-US")}
          {r.item.unit ? <span className="text-[13px] font-medium text-ink-3">{r.item.unit}</span> : null}
          <ChevronRight size={16} className="text-ink-3" aria-hidden />
        </Link>
      );
    }
    return undefined;
  };

  const dailyRow = (r: ItemResult) => (
    <ChecklistRow
      action={actionFor(r)}
      key={r.item.id}
      item={r.item}
      target={r.target}
      log={r.log}
      state={r.state}
      streak={streaks[r.item.id]?.current}
      sub={subFor(r.item)}
      disabled={!editable}
      onCheck={(v) => (editable ? void setChecked(r.item.id, date, v) : refuse())}
      onValue={(v) => (editable ? void setValue(r.item.id, date, v) : refuse())}
      onText={(t) => (editable ? void setText(r.item.id, date, t) : refuse())}
      onNeedText={() => toast("Write what you did first")}
    />
  );

  // Weekly items: done on any day of the week counts. A change goes to the
  // day it was logged on, or to the day on screen when it is new.
  const weeklyRow = (r: WeeklyResult) => {
    const target = r.doneOn ?? r.log?.date ?? date;
    const canEdit = isDayEditable(target, now, installedOn);
    const elsewhere = r.done && r.doneOn !== date;
    const sub = r.done
      ? elsewhere
        ? `Done ${formatDateShort(r.doneOn as DateStr)}`
        : "Done this week"
      : (r.item.hint ?? undefined);
    return (
      <ChecklistRow
        key={r.item.id}
        item={r.item}
        target={r.target}
        log={r.log}
        state={r.done ? "done" : r.log && (r.log.checked || r.log.value !== null) ? "off" : "open"}
        streak={streaks[r.item.id]?.current}
        sub={sub}
        disabled={!canEdit}
        onCheck={(v) => (canEdit ? void setChecked(r.item.id, target, v) : refuse())}
        onValue={(v) => {
          if (!canEdit) return refuse();
          if (r.item.key === "weighin") void logWeight(target, v);
          else void setValue(r.item.id, target, v);
        }}
        onText={(t) => (canEdit ? void setText(r.item.id, target, t) : refuse())}
        onNeedText={() => toast("Write what you did first")}
      />
    );
  };

  return (
    <Screen>
      {topBar}

      <header className="flex items-end justify-between gap-4 pt-3 pb-5">
        <div className="min-w-0">
          {n !== null && c ? (
            <>
              <h1 className="flex items-baseline gap-2.5">
                <span className="t-display">Day {n}</span>
                <span className="text-[22px] font-medium tracking-[-0.02em] text-ink-3">of {c.length_days}</span>
              </h1>
              <p className="mt-2.5 text-[15px] text-ink-2">
                {formatDateLong(date)}
                {scoped ? ` · ${c.name}: ${scoped.done} of ${scoped.total}` : ""}
              </p>
            </>
          ) : (
            <>
              <h1 className="flex items-baseline gap-2.5">
                <span className="t-display">{formatDateShort(date)}</span>
                <span className="text-[22px] font-medium tracking-[-0.02em] text-ink-3">{WEEKDAY_NAMES[weekdayOf(date)].slice(0, 3)}</span>
              </h1>
              <p className="mt-2.5 text-[15px] text-ink-2" data-consistency>
                {steady.days === 0 ? "First day. Keep it going." : `${consistencyLabel(steady)} locked in`}
              </p>
            </>
          )}
        </div>
        <div key={glow} className={cn("shrink-0", glow > 0 && "animate-ring-glow")}>
          <ProgressRing value={percent / 100} size={84} stroke={8} label="Checklist done">
            <span className="tnum text-[22px] font-semibold tracking-[-0.03em]">
              {percent}
              <span className="text-[13px] font-medium text-ink-3">%</span>
            </span>
          </ProgressRing>
        </div>
      </header>

      <DayStrip days={strip} today={today} selected={date} statusByDate={statusByDate} onSelect={setPicked} label={c ? "Challenge days" : "Recent days"} />

      {closing && closingRecord && isToday ? (
        <Card className="mt-4 border-accent-line">
          <p className="t-label text-accent">Challenge done</p>
          <p className="t-h2 mt-1.5">
            {closing.name}: all {closing.length_days} {closing.length_days === 1 ? "day" : "days"} are behind you.
          </p>
          <p className="t-sub mt-1.5">
            {closingRecord.full} full, {closingRecord.partial} partial, {closingRecord.missed} missed. Closing it keeps every day you logged. You carry on in ongoing mode.
          </p>
          <div className="mt-4 flex gap-2.5">
            <Button full loading={finishing} icon={<Flag size={18} aria-hidden />} onClick={() => void finish()}>
              Finish challenge
            </Button>
            <Link href="/progress" className="pressable flex h-12 shrink-0 items-center rounded-[14px] border border-line-strong px-4 text-[16px] font-semibold text-ink">
              Review
            </Link>
          </div>
        </Card>
      ) : null}

      {mode.upcoming && isToday ? (
        <Link href="/settings/challenge" className="pressable mt-4 flex items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-3 text-[14px] text-ink-2">
          <span>
            {mode.upcoming.name} starts {formatDateLong(mode.upcoming.start_date)}
          </span>
          <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />
        </Link>
      ) : null}

      {!editable ? (
        <div className="mt-4 flex items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3.5 py-3 text-[14px] text-ink-2">
          <Lock size={16} className="shrink-0" aria-hidden />
          Locked. Days close at noon the next day.
        </div>
      ) : !isToday ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-3 text-[14px] text-ink-2">
          <span>
            Open until {formatDateShort(lockAt.date)}, {formatTime(lockAt.time)}
          </span>
          <button type="button" onClick={() => setPicked(null)} className="font-semibold text-ink">
            Back to today
          </button>
        </div>
      ) : null}

      {isToday ? (
        <div className="mt-4 flex flex-col gap-3">
          <SetupRow />
          <CoachTodaySlot />
          <NowNext blocks={blocks.data} now={now} loading={blocks.loading} />
          <ScheduleTodaySlot date={date} />
        </div>
      ) : null}

      <Section
        title="Checklist"
        right={summary ? <span className="tnum">{summary.done} of {summary.total}</span> : null}
      >
        {!summary ? (
          <Card className="h-[420px]" aria-busy="true" />
        ) : summary.items.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              compact
              title="Nothing on the checklist"
              body="Add the items you want to hold yourself to."
              action={<Link href="/settings/checklist" className="font-semibold text-ink underline underline-offset-4">Edit checklist</Link>}
            />
          </Card>
        ) : (
          <Card padded={false} key={date} className="overflow-hidden">
            <div className="divide-y divide-line">{summary.items.map(dailyRow)}</div>
          </Card>
        )}
        {isToday && editable ? <VicesTodaySlot /> : null}
      </Section>

      {week && week.items.length > 0 ? (
        <Section title="This week" right={<span className="tnum">{week.done} of {week.total}</span>}>
          <Card padded={false} key={date} className="overflow-hidden">
            <div className="divide-y divide-line">{week.items.map(weeklyRow)}</div>
          </Card>
        </Section>
      ) : null}

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

      {moment === date && summary ? (
        <DayComplete title={dayTitle} total={summary.total} streak={fullDayStreak(statusByDate, today, start)} isToday={isToday} onDone={endMoment} />
      ) : null}

      {moreOpen ? <MoreSheet onClose={() => setMoreOpen(false)} /> : null}
      {finished ? <ChallengeComplete challenge={finished.challenge} full={finished.full} onDone={() => setFinished(null)} /> : null}
    </Screen>
  );
}
