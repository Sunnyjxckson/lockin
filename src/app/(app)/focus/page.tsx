"use client";

// Study and focus timer (PRD 18). Start a timer or log hours by hand, see
// today against the goal and the week by day, and keep the study item on the
// checklist in step.

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Briefcase, Pencil, Plus, Timer } from "lucide-react";
import { Button, Card, EmptyState, IconButton, ListRow, NumberField, PageHeader, ProgressBar, Screen, Section, Sheet, useToast } from "@/components/ui";
import { FocusModeCard } from "@/features/focus/FocusModeCard";
import { RunningTimer, StartPanel } from "@/features/focus/TimerPanel";
import { WeekChart } from "@/features/focus/WeekChart";
import { changeLive, discardTimer, finishTimer, startTimer } from "@/features/focus/store";
import { useClock, useFocusTimer, usePrefText } from "@/features/focus/useFocus";
import { updateSettings } from "@/lib/db/helpers";
import { useDayBlocks, useList, useMode, useNow, useSettings } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { addDays, formatDateShort, formatDuration, formatTime, nyParts, weekStart } from "@/lib/logic/dates";
import { formatAway, goalProgress, liveStudyBlock, minutesOn, pendingAway, reviewAways, staleInfo, weekByDay } from "@/lib/logic/focus";
import type { FocusSession } from "@/lib/types";

const SessionSheet = dynamic(() => import("@/features/focus/SessionSheet").then((m) => m.SessionSheet), { ssr: false });
const FocusView = dynamic(() => import("@/features/focus/FocusView").then((m) => m.FocusView), { ssr: false });

export default function FocusPage() {
  const mode = useMode();
  const today = mode.today;
  const toast = useToast();
  const settings = useSettings();
  const goal = settings.data?.focus_goal_minutes ?? 60;
  const timer = useFocusTimer();
  const { live } = timer;
  const { now, clock } = useClock(live);
  const from = useMemo(() => {
    const d = addDays(weekStart(today), -28);
    return d < mode.historyStart ? mode.historyStart : d;
  }, [today, mode.historyStart]);
  const sessions = useList("focus_session", { from: from < weekStart(today) ? from : weekStart(today), to: today, orderBy: "created_at", ascending: false });
  const blocks = useDayBlocks(today);
  const coarse = useNow(30000);

  const [fullPref, setFullPref] = usePrefText("focus:fullscreen");
  const [notice, setNotice] = usePrefText("focus:notice");
  // The timer the full screen view is open for, so it closes with that timer.
  const [viewId, setViewId] = useState<string | null>(null);
  const view = !!live && viewId === live.id;
  const [sheet, setSheet] = useState<{ session: FocusSession | null } | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState<number | null>(null);
  const [realMinutes, setRealMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const fullScreen = fullPref === "1";

  const done = useMemo(() => sessions.data.filter((s) => s.end !== null), [sessions.data]);
  const liveMinutes = clock ? Math.floor(clock.focusedSeconds / 60) : 0;
  const liveDate = live ? nyParts(new Date(live.startedAt)).date : null;
  const todayMinutes = minutesOn(done, today) + (liveDate === today ? liveMinutes : 0);
  const week = weekByDay(done, today, goal, liveDate ? { date: liveDate, minutes: liveMinutes } : null);
  const weekTotal = week.reduce((n, d) => n + d.minutes, 0);
  const met = goal > 0 && todayMinutes >= goal;

  const stale = live ? staleInfo(live, now) : null;
  const away = live && !stale ? pendingAway(live) : null;
  const p = nyParts(coarse);
  const study = !live && !blocks.loading ? liveStudyBlock(blocks.data, p.minutes * 60 + coarse.getSeconds()) : null;


  const startForBlock = async () => {
    if (!study) return;
    const next = await startTimer({ label: "Study", plannedSeconds: study.remainingSeconds, blockId: study.block.id });
    haptics.done();
    if (fullScreen && next) setViewId(next.id);
  };

  const settleStale = async (minutes: number | null) => {
    if (!live || !stale) return;
    setBusy(true);
    try {
      if (minutes === null || minutes < 1) {
        await discardTimer(live);
        toast("Timer thrown out. Nothing logged.");
      } else {
        await finishTimer(live, { at: stale.endedAt, minutes });
        toast(`${formatDuration(minutes)} of focus logged`, { kind: "done" });
      }
      setRealMinutes(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHeader
        title="Focus"
        back="/schedule"
        right={
          <IconButton label="Log focus time by hand" onClick={() => setSheet({ session: null })}>
            <Plus size={22} aria-hidden />
          </IconButton>
        }
      />

      <div className="space-y-3">
        {notice ? (
          <Card className="border-warn bg-warn-soft" role="status" data-notice>
            <p className="t-label text-warn">Strict mode</p>
            <p className="mt-1.5 text-[15px]">{notice}</p>
            <Button className="mt-3" size="sm" variant="secondary" onClick={() => setNotice(null)}>
              Got it
            </Button>
          </Card>
        ) : null}

        {live && stale ? (
          <Card className="border-warn bg-warn-soft" role="alert" data-stale>
            <p className="t-label text-warn">Timer left running</p>
            <p className="t-h2 mt-2">
              {live.label} has been on the clock for {formatDuration(stale.clockMinutes)}
            </p>
            <p className="mt-1 text-[14px] text-ink-2">
              {stale.reason === "away"
                ? `You left the app after ${formatDuration(stale.suggestedMinutes)} and did not come back. How long did you really work?`
                : "That is longer than one sitting. How long did you really work?"}
            </p>
            <div className="mt-3">
              <NumberField label="Minutes that count" value={realMinutes ?? stale.suggestedMinutes} onChange={setRealMinutes} live unit="min" decimal={false} max={Math.max(stale.suggestedMinutes, 360)} />
            </div>
            <div className="mt-3 flex gap-2">
              <Button full loading={busy} onClick={() => settleStale(realMinutes ?? stale.suggestedMinutes)}>
                Log {formatDuration(realMinutes ?? stale.suggestedMinutes)}
              </Button>
              <Button full variant="secondary" disabled={busy} onClick={() => settleStale(null)}>
                Throw it out
              </Button>
            </div>
          </Card>
        ) : null}

        {away ? (
          <Card className="border-warn bg-warn-soft" role="alert" data-away>
            <p className="t-label text-warn">You left the app</p>
            <p className="t-h2 tnum mt-2">Gone for {formatAway(((away.to ?? now) - away.from) / 1000)}</p>
            <p className="mt-1 text-[14px] text-ink-2">That time is off the clock. If you were still working, on paper or a laptop, take it back.</p>
            <div className="mt-3 flex gap-2">
              <Button full onClick={() => changeLive((l) => reviewAways(l, false))}>
                Leave it off
              </Button>
              <Button full variant="secondary" onClick={() => changeLive((l) => reviewAways(l, true))}>
                I was working
              </Button>
            </div>
          </Card>
        ) : null}

        {live && clock && !stale ? (
          <Card>
            <RunningTimer live={live} clock={clock} now={now} onExpand={() => setViewId(live.id)} />
          </Card>
        ) : null}

        {!live && !timer.loading ? (
          <>
            {study ? (
              <Card className="flex items-center gap-3" data-study-block>
                <div className="min-w-0 flex-1">
                  <p className="t-label flex items-center gap-2">
                    <span className="animate-pulse-dot size-1.5 rounded-full bg-ink" aria-hidden />
                    On your schedule now
                  </p>
                  <p className="mt-1 truncate text-[16px] font-semibold">{study.block.block_name}</p>
                  <p className="tnum text-[13px] text-ink-2">
                    Until {formatTime(study.block.end)}, {formatDuration(Math.floor(study.remainingSeconds / 60))} left
                  </p>
                </div>
                <Button size="sm" onClick={startForBlock}>
                  Start it
                </Button>
              </Card>
            ) : null}
            <StartPanel fullScreen={fullScreen} onStarted={(l) => (fullScreen ? setViewId(l.id) : undefined)} />
          </>
        ) : null}
      </div>

      <Section
        title="Today"
        right={
          <button
            type="button"
            className="pressable -my-2 flex h-11 items-center gap-1.5 text-[13px] font-semibold text-ink-2"
            onClick={() => {
              setGoalDraft(goal);
              setGoalOpen(true);
            }}
          >
            <Pencil size={14} aria-hidden />
            Goal
          </button>
        }
      >
        <Card data-today-total>
          <div className="flex items-end justify-between gap-3">
            <p className={met ? "t-num text-accent" : "t-num"}>{formatDuration(todayMinutes)}</p>
            <p className="tnum pb-1.5 text-[14px] text-ink-2">{goal > 0 ? `of ${formatDuration(goal)}` : "No goal set"}</p>
          </div>
          <ProgressBar value={goalProgress(todayMinutes, goal)} tone={met ? "accent" : "ink"} className="mt-3" label="Today against the focus goal" />
          <p className="mt-3 text-[13px] text-ink-3">
            {met ? "Goal reached. Study is ticked on today's checklist." : goal > 0 ? `${formatDuration(Math.max(0, goal - todayMinutes))} to go. Reaching it ticks Study on the checklist.` : "Set a goal and reaching it ticks Study on the checklist."}
          </p>
        </Card>
      </Section>

      <Section title="This week" right={<span className="tnum text-[13px] text-ink-2">{formatDuration(weekTotal)}</span>}>
        <Card>
          <WeekChart days={week} goal={goal} />
        </Card>
      </Section>

      <Section title="Sessions">
        {done.length === 0 ? (
          <EmptyState
            compact
            icon={<Timer size={24} aria-hidden />}
            title="No focus sessions yet"
            body="Start the timer, or log time you already put in."
            action={
              <Button variant="secondary" size="sm" onClick={() => setSheet({ session: null })}>
                Log time by hand
              </Button>
            }
          />
        ) : (
          <Card padded={false} className="overflow-hidden">
            <div className="divide-y divide-line">
              {done.slice(0, 30).map((s) => {
                const bits = [s.date === today ? "Today" : formatDateShort(s.date), s.source === "manual" ? "by hand" : formatTime(s.start)];
                if (s.away_count > 0) bits.push(`left the app ${s.away_count} ${s.away_count === 1 ? "time" : "times"}${s.away_minutes > 0 ? `, ${formatDuration(s.away_minutes)} away` : ""}`);
                if (s.completed && s.block_id) bits.push("block done");
                return (
                  <ListRow
                    key={s.id}
                    title={s.label ?? "Study"}
                    sub={bits.join(", ")}
                    right={<span className="tnum text-[17px] font-semibold">{formatDuration(s.minutes)}</span>}
                    onClick={() => setSheet({ session: s })}
                  />
                );
              })}
            </div>
          </Card>
        )}
      </Section>

      <Section title="Focus mode">
        <FocusModeCard fullScreen={fullScreen} onFullScreen={(on) => setFullPref(on ? "1" : null)} />
      </Section>

      <Section title="Business">
        <Card padded={false} className="overflow-hidden">
          <ListRow
            href="/focus/business"
            left={<Briefcase size={20} className="text-ink-2" aria-hidden />}
            title="Business log"
            sub="Your goal and the moves made toward it"
          />
        </Card>
      </Section>

      {sheet ? <SessionSheet key={sheet.session?.id ?? "new"} open onClose={() => setSheet(null)} today={today} session={sheet.session} /> : null}

      <Sheet
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        title="Daily focus goal"
        subtitle="Reaching it ticks Study on the checklist."
        footer={
          <Button
            full
            size="lg"
            onClick={async () => {
              await updateSettings({ focus_goal_minutes: Math.max(0, Math.round(goalDraft ?? 0)) });
              setGoalOpen(false);
            }}
          >
            Save
          </Button>
        }
      >
        <NumberField label="Minutes a day" value={goalDraft} onChange={setGoalDraft} live unit="min" decimal={false} max={720} autoFocus />
      </Sheet>

      {view && live && clock ? <FocusView live={live} clock={clock} now={now} onClose={() => setViewId(null)} /> : null}
    </Screen>
  );
}
