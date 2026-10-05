"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Flag, Infinity as InfinityIcon, Plus } from "lucide-react";
import { Button, Card, DateField, GlassCard, NumberField, PageHeader, ProgressBar, Screen, Section, Sheet, TextField, Toggle, TrackStat, useToast } from "@/components/ui";
import { endChallenge, finishChallenge, restartChallenge, setDailyFloor, updateChallenge, updateSettings } from "@/lib/db/helpers";
import { useChecklist, useLogs, useMode } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import {
  MAX_CHALLENGE_DAYS,
  STATUS_LABEL,
  challengeDay,
  challengeItems,
  challengeRecord,
  consistency,
  consistencyLabel,
  daysRun,
  lastDay,
  pastChallenges,
  plannedEnd,
  ranOn,
} from "@/lib/logic/challenge";
import { addDays, dateRange, dayNumber, formatDateLong, formatDateShort, isDateStr } from "@/lib/logic/dates";
import { summarizeDay, type DayStatus } from "@/lib/logic/day";
import { describeTarget } from "@/lib/logic/targets";
import type { Challenge, ChecklistItem, DateStr } from "@/lib/types";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "Whole checklist", or the items a challenge names with the target each is held to. */
function rulesLine(c: Challenge, items: ChecklistItem[]): string {
  if (!c.rules) return "Counts the whole checklist";
  const named = challengeItems(c, items);
  return `Counts ${plural(named.length, "item")}: ${named.map((i) => i.name).join(", ")}`;
}

function Editor({ challenge, historyStart, today }: { challenge: Challenge; historyStart: DateStr; today: DateStr }) {
  const toast = useToast();
  const [name, setName] = useState(challenge.name);
  const [start, setStart] = useState(challenge.start_date);
  const [length, setLength] = useState<number>(challenge.length_days);
  const [hasMoney, setHasMoney] = useState(challenge.money_target !== null);
  const [target, setTarget] = useState<number | null>(challenge.money_target);
  const [deadline, setDeadline] = useState<DateStr>(challenge.money_deadline ?? plannedEnd(challenge));
  const [from, setFrom] = useState<DateStr | null>(challenge.money_target_start ?? null);
  const [saving, setSaving] = useState(false);

  const next = {
    name: name.trim(),
    start_date: start,
    length_days: length,
    money_target: hasMoney ? target : null,
    money_deadline: hasMoney ? deadline : null,
    money_target_start: hasMoney ? from : null,
  };
  const dirty = (Object.keys(next) as (keyof typeof next)[]).some((k) => (next[k] ?? null) !== (challenge[k] ?? null));
  const valid =
    next.name.length > 0 &&
    isDateStr(start) &&
    Number.isInteger(length) &&
    length >= 1 &&
    length <= MAX_CHALLENGE_DAYS &&
    (!hasMoney || (target !== null && target > 0 && isDateStr(deadline) && deadline >= start));

  const save = async () => {
    setSaving(true);
    try {
      await updateChallenge(next);
      // A start moved back before the history opens the history up to it.
      if (start < historyStart) await updateSettings({ history_start: start });
      toast("Challenge saved", { kind: "done" });
    } catch {
      toast("Could not save", { kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  const end = valid ? addDays(start, length - 1) : null;
  const n = valid ? dayNumber(start, today) : null;

  return (
    <>
      <Section title="Details">
        <div className="flex flex-col gap-4">
          <TextField label="Name" value={name} onChange={setName} maxLength={40} />
          <DateField label="Start date" value={start} onChange={(v) => setStart(v as DateStr)} />
          <NumberField label="Length" unit="days" decimal={false} min={1} max={MAX_CHALLENGE_DAYS} value={length} onChange={(v) => setLength(v ?? 0)} live />
          {end && n !== null ? (
            <p className="t-sub">
              Ends {formatDateLong(end)}. {n < 1 ? `Starts in ${plural(1 - n, "day")}.` : n > length ? "That is already over." : `Today is day ${n}.`}
            </p>
          ) : null}
        </div>
      </Section>

      <Section title="Money target">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[15px] text-ink">Money target</p>
              <p className="t-caption mt-0.5 text-ink-2">A total to reach by a date</p>
            </div>
            <Toggle
              label="This challenge has a money target"
              checked={hasMoney}
              onChange={(v) => {
                setHasMoney(v);
                if (v && target === null) setTarget(1000);
              }}
            />
          </div>
          {hasMoney ? (
            <>
              <NumberField label="Target" prefix="$" value={target} onChange={setTarget} live />
              <DateField label="Deadline" value={deadline} min={start} onChange={(v) => setDeadline(v as DateStr)} />
              <DateField
                label="Counts from"
                hint="Earnings from this date count."
                value={from && from > start ? from : start}
                min={start}
                onChange={(v) => setFrom(v && v > start ? (v as DateStr) : null)}
              />
            </>
          ) : null}
        </div>
      </Section>

      <div className="mt-4">
        <Button variant={dirty && valid ? "primary" : "secondary"} full size="lg" disabled={!dirty || !valid} loading={saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </>
  );
}

type Confirm = "end" | "restart" | { runAgain: Challenge } | null;

export default function ChallengeSettingsPage() {
  const toast = useToast();
  const mode = useMode();
  const checklist = useChecklist();
  const today = mode.today;
  const logs = useLogs(mode.historyStart, today);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);

  const active = mode.challenge ?? mode.finished ?? mode.upcoming;
  const past = useMemo(() => pastChallenges(mode.challenges), [mode.challenges]);
  const items = checklist.data.items;

  // Every day of the history scored once: by the whole checklist for the
  // ongoing number, and by each challenge's own items for its record.
  const scored = useMemo(() => {
    if (checklist.loading || logs.loading || mode.historyStart > today) return [];
    return dateRange(mode.historyStart, today).map((d) => summarizeDay(d, items, checklist.data.versions, logs.data));
  }, [checklist.loading, checklist.data.versions, items, logs.loading, logs.data, mode.historyStart, today]);

  const ongoing = useMemo(() => {
    const status: Record<DateStr, DayStatus> = {};
    for (const s of scored) status[s.date] = s.status;
    return consistency(status, today, mode.historyStart, 30);
  }, [scored, today, mode.historyStart]);

  const recordOf = (c: Challenge) => {
    const status: Record<DateStr, DayStatus> = {};
    for (const s of scored) if (ranOn(c, s.date)) status[s.date] = challengeDay(c, s).status;
    return challengeRecord(c, status, today);
  };

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      haptics.done();
      toast(done, { kind: "done" });
      setConfirm(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "That did not work", { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const loading = mode.loading || checklist.loading;
  const record = active && (mode.challenge || mode.finished) ? recordOf(active) : null;

  return (
    <Screen>
      <PageHeader title="Challenge" back="/settings" subtitle="A set run on top of ongoing, which never resets." />

      {loading ? null : (
        <>
          {!active ? (
            <GlassCard className="mt-2">
              <div className="flex items-center gap-2 text-ink-2">
                <InfinityIcon size={16} strokeWidth={1.75} aria-hidden />
                <span className="t-label">Mode</span>
              </div>
              <p className="t-h1 mt-2.5">Ongoing</p>
              <p className="t-sub mt-2">{ongoing.days > 0 ? `${consistencyLabel(ongoing)} locked in.` : "Today is the first day of your history."} A slip costs that one day.</p>
              <Link href="/settings/challenge/new" className="pressable grad shadow-glow mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-medium tracking-[-0.01em]">
                <Plus size={18} strokeWidth={1.75} aria-hidden />
                Start a challenge
              </Link>
            </GlassCard>
          ) : (
            <GlassCard className="mt-2" data-challenge-card>
              <span className="t-label">{mode.challenge ? "Running" : mode.finished ? "Done, waiting to be closed" : "Coming up"}</span>
              <p className="t-h1 mt-2.5">{active.name}</p>
              <p className="t-sub mt-2">
                {mode.challenge
                  ? `Day ${mode.day} of ${active.length_days}`
                  : mode.finished
                    ? `All ${plural(active.length_days, "day")} are behind you`
                    : `Starts ${formatDateLong(active.start_date)}`}
                {" · "}
                {formatDateShort(active.start_date)} to {formatDateShort(plannedEnd(active))}
              </p>
              {mode.challenge ? <ProgressBar className="mt-4" value={(mode.day ?? 0) / Math.max(1, active.length_days)} label="Days into the challenge" /> : null}
              {record ? (
                <div className="mt-5 grid grid-cols-3 gap-3.5">
                  <TrackStat label="Full" value={record.full} />
                  <TrackStat label="Partial" value={record.partial} />
                  <TrackStat label="Missed" value={record.missed} />
                </div>
              ) : null}
              <p className="t-caption mt-4 text-ink-2">{rulesLine(active, items)}</p>
              {active.rules?.some((r) => r.target) ? (
                <ul className="t-caption mt-1.5 space-y-1 text-ink-2">
                  {active.rules
                    .filter((r) => r.target)
                    .map((r) => {
                      const item = items.find((i) => i.id === r.item_id);
                      return item && r.target ? (
                        <li key={r.item_id}>
                          {item.name}: {describeTarget(r.target, item.unit)} while it runs
                        </li>
                      ) : null;
                    })}
                </ul>
              ) : null}
              <div className="mt-5 flex gap-2.5">
                {mode.finished ? (
                  <Button full loading={busy} icon={<Flag size={18} strokeWidth={1.75} aria-hidden />} onClick={() => void run(() => finishChallenge(today), "Challenge finished")}>
                    Finish challenge
                  </Button>
                ) : (
                  <Button variant="secondary" full onClick={() => setConfirm("end")}>
                    {mode.upcoming ? "Cancel it" : "End early"}
                  </Button>
                )}
                {mode.upcoming ? null : (
                  <Button variant="secondary" full onClick={() => setConfirm("restart")}>
                    Restart
                  </Button>
                )}
              </div>
            </GlassCard>
          )}

          {active ? <Editor key={`${active.id}:${active.start_date}:${active.length_days}:${active.name}`} challenge={active} historyStart={mode.historyStart} today={today} /> : null}

          <Section title="Daily floor">
            <div>
              <NumberField
                label="Earn at least"
                prefix="$"
                hint={
                  mode.floor !== mode.baseFloor && mode.challenge
                    ? `${mode.challenge.name} holds Earned today to $${mode.floor.toLocaleString("en-US")} while it runs. This is the floor outside it.`
                    : "Every day, challenge or not."
                }
                value={mode.baseFloor}
                onChange={(v) => {
                  if (v === null || v === mode.baseFloor) return;
                  void setDailyFloor(v, today).then(
                    () => toast("Floor saved. Applies from today.", { kind: "done" }),
                    () => toast("Could not save", { kind: "error" }),
                  );
                }}
              />
            </div>
          </Section>

          <Section title="Past challenges" right={past.length > 0 ? <span>{past.length}</span> : null}>
            {past.length === 0 ? (
              <p className="tile t-sub rounded-[20px] px-4 py-3.5">None yet. Ended and finished challenges are kept here.</p>
            ) : (
              <Card padded={false} className="overflow-hidden">
                <ul className="divide-y divide-hair">
                  {past.map((c) => {
                    const r = recordOf(c);
                    const ran = daysRun(c, today);
                    return (
                      <li key={c.id} className="flex items-center gap-2 pr-3 pl-4">
                        <Link href={`/progress?challenge=${c.id}`} className="pressable flex min-h-[64px] min-w-0 flex-1 items-center gap-2 py-2.5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] text-ink">{c.name}</span>
                            <span className="tnum t-caption mt-0.5 block truncate text-ink-2">
                              {STATUS_LABEL[c.status]}
                              {ran > 0 ? ` · ${formatDateShort(c.start_date)} to ${formatDateShort(lastDay(c))} · ${r.full} of ${plural(ran, "day")} full` : " · never ran a day"}
                            </span>
                          </span>
                          <ChevronRight size={18} strokeWidth={1.75} className="shrink-0 text-ink-3" aria-hidden />
                        </Link>
                        {!active ? (
                          <Button variant="secondary" size="sm" aria-label={`Run ${c.name} again`} onClick={() => setConfirm({ runAgain: c })}>
                            Again
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
            {active ? null : past.length > 0 ? <p className="t-sub mt-3 px-1">Again starts the same run today.</p> : null}
          </Section>
        </>
      )}

      <Sheet
        open={confirm === "end"}
        onClose={() => setConfirm(null)}
        title={mode.upcoming ? "Cancel this challenge?" : "End the challenge today?"}
        subtitle={
          mode.upcoming
            ? "It has not started, so nothing is lost."
            : "It is kept as a past challenge. Every logged day and streak stays."
        }
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" full onClick={() => setConfirm(null)}>
              Keep going
            </Button>
            <Button variant="danger" full loading={busy} onClick={() => void run(() => endChallenge(today), "Challenge ended. Ongoing from here.")}>
              End challenge
            </Button>
          </div>
        }
      >
        {null}
      </Sheet>

      <Sheet
        open={confirm === "restart"}
        onClose={() => setConfirm(null)}
        title="Restart from day 1 today?"
        subtitle="Same run, from today. The run so far is kept, and so is every logged day and streak."
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" full onClick={() => setConfirm(null)}>
              Not now
            </Button>
            <Button full loading={busy} onClick={() => void run(() => restartChallenge(null, today), "Restarted. Today is day 1.")}>
              Restart today
            </Button>
          </div>
        }
      >
        {null}
      </Sheet>

      <Sheet
        open={!!confirm && typeof confirm === "object"}
        onClose={() => setConfirm(null)}
        title={confirm && typeof confirm === "object" ? `Run ${confirm.runAgain.name} again?` : undefined}
        subtitle={confirm && typeof confirm === "object" ? `${plural(confirm.runAgain.length_days, "day")}, starting today, with the same rules.` : undefined}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" full onClick={() => setConfirm(null)}>
              Not now
            </Button>
            <Button
              full
              loading={busy}
              onClick={() => {
                if (confirm && typeof confirm === "object") void run(() => restartChallenge(confirm.runAgain.id, today), "Started. Today is day 1.");
              }}
            >
              Start today
            </Button>
          </div>
        }
      >
        {null}
      </Sheet>
    </Screen>
  );
}
