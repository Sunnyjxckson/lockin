"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Lock, MessageSquareText, Settings, ShieldBan } from "lucide-react";
import { Card, EmptyState, ProgressRing, Screen, Section, cn, useToast } from "@/components/ui";
import { logWeight, setChecked, setText, setValue, workoutsFor } from "@/lib/db/helpers";
import {
  useChallenge,
  useChecklist,
  useDay,
  useDayBlocks,
  useInstalledOn,
  useLogs,
  useNow,
  useToday,
  useWorkouts,
} from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import {
  challengeDates,
  challengeEndDate,
  dayNumber,
  diffDays,
  formatDateLong,
  formatDateShort,
  formatTime,
  isDayEditable,
  lockInstant,
  nyParts,
  weekdayOf,
} from "@/lib/logic/dates";
import { summarizeDay, type DayStatus, type ItemResult, type WeeklyResult } from "@/lib/logic/day";
import { allStreaks } from "@/lib/logic/streaks";
import type { ChecklistItem, DateStr } from "@/lib/types";
import { ChecklistRow } from "./ChecklistRows";
import { DayStrip } from "./DayStrip";
import { NowNext } from "./NowNext";
import { WorkoutCard } from "./WorkoutCard";

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
  const today = useToday();
  const challenge = useChallenge();
  const installedOn = useInstalledOn();

  // The day on screen. Null means "follow today".
  const [picked, setPicked] = useState<DateStr | null>(null);

  const c = challenge.data;
  const start = c?.start_date ?? today;
  const end = c ? challengeEndDate(c.start_date, c.length_days) : today;
  const lastOpen = today > end ? end : today;
  const date = picked && picked >= start && picked <= lastOpen ? picked : lastOpen;
  const isToday = date === today;

  const day = useDay(date);
  const checklist = useChecklist();
  const history = useLogs(start, lastOpen);
  const blocks = useDayBlocks(today);
  const workouts = useWorkouts();

  const dates = useMemo(() => (c ? challengeDates(c.start_date, c.length_days) : []), [c]);

  const statusByDate = useMemo(() => {
    const out: Record<DateStr, DayStatus> = {};
    if (checklist.loading || history.loading) return out;
    for (const d of dates) {
      if (d > today) break;
      out[d] = summarizeDay(d, checklist.data.items, checklist.data.versions, history.data).status;
    }
    return out;
  }, [dates, today, checklist.loading, checklist.data, history.loading, history.data]);

  const streaks = useMemo(
    () => (checklist.loading || history.loading ? {} : allStreaks(checklist.data.items, checklist.data.versions, history.data, lastOpen, start)),
    [checklist.loading, checklist.data, history.loading, history.data, lastOpen, start],
  );

  // The bigger moment when the last item of a day lands.
  const [glow, setGlow] = useState(0);
  const seen = useRef<{ date: DateStr; status: DayStatus } | null>(null);
  const status = day.summary?.status ?? null;
  useEffect(() => {
    if (!status) return;
    const prev = seen.current;
    seen.current = { date, status };
    if (prev && prev.date === date && prev.status !== "full" && status === "full") {
      haptics.celebrate();
      setGlow((n) => n + 1);
      toast(isToday ? "Day locked in" : "Day complete", { kind: "done", duration: 3200 });
    }
  }, [date, status, isToday, toast]);

  if (challenge.loading) return <Screen aria-busy="true">{null}</Screen>;

  if (!c) {
    return (
      <Screen>
        <EmptyState title="No challenge yet" body="Set a start date and length to begin." action={<Link href="/settings/challenge" className="text-ink underline underline-offset-4">Open Settings</Link>} />
      </Screen>
    );
  }

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
        <HeaderLink href="/settings" label="Settings">
          <Settings size={22} aria-hidden />
        </HeaderLink>
      </div>
    </div>
  );

  if (today < c.start_date) {
    const n = diffDays(today, c.start_date);
    return (
      <Screen>
        {topBar}
        <div className="pt-10">
          <p className="t-label">Starts {formatDateLong(c.start_date)}</p>
          <p className="t-display mt-3">{n}</p>
          <p className="t-h2 mt-2 text-ink-2">{n === 1 ? "day to go" : "days to go"}</p>
          <p className="t-sub mt-6 max-w-[300px]">
            {c.length_days} days. The checklist opens on day 1. Set your targets and schedule in Settings before then.
          </p>
        </div>
      </Screen>
    );
  }

  const n = dayNumber(c.start_date, date);
  const over = today > end;
  const editable = isDayEditable(date, now, installedOn);
  const summary = day.summary;
  const week = day.week;
  const percent = summary?.percent ?? 0;
  const lockAt = nyParts(lockInstant(date, installedOn));
  const w = workoutsFor(workouts.data, weekdayOf(date));

  const refuse = () => {
    haptics.error();
    toast("This day is locked", { kind: "error" });
  };

  const subFor = (item: ChecklistItem): string | undefined => {
    if (item.key === "workout" && w.main) return w.main.detail ? `${w.main.name}, ${w.main.detail.toLowerCase()}` : w.main.name;
    if (item.key === "core" && w.core) return w.core.name.replace(/^Core:\s*/i, "").replace(/^./, (ch) => ch.toUpperCase()) + (w.core.detail ? `, ${w.core.detail.toLowerCase()}` : "");
    return undefined;
  };

  const dailyRow = (r: ItemResult) => (
    <ChecklistRow
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
          <h1 className="flex items-baseline gap-2.5">
            <span className="t-display">Day {n}</span>
            <span className="text-[22px] font-medium tracking-[-0.02em] text-ink-3">of {c.length_days}</span>
          </h1>
          <p className="mt-2.5 text-[15px] text-ink-2">
            {formatDateLong(date)}
            {over && isToday === false && date === end ? " · Final day" : ""}
          </p>
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

      <DayStrip dates={dates} startDate={c.start_date} today={today} selected={date} statusByDate={statusByDate} onSelect={setPicked} />

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

      {isToday && !over ? (
        <div className="mt-5">
          <NowNext blocks={blocks.data} now={now} loading={blocks.loading} />
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
      </Section>

      {week && week.items.length > 0 ? (
        <Section title="This week" right={<span className="tnum">{week.done} of {week.total}</span>}>
          <Card padded={false} key={date} className="overflow-hidden">
            <div className="divide-y divide-line">{week.items.map(weeklyRow)}</div>
          </Card>
        </Section>
      ) : null}

      <Section title={isToday ? "Today's workout" : "Workout"}>
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
    </Screen>
  );
}
