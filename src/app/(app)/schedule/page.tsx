"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, MapPin, Plus, RotateCcw, Timer } from "lucide-react";
import { Button, Card, EmptyState, IconLink, PageHeader, Screen, Section, Sheet, Toggle, useToast } from "@/components/ui";
import { getBlocksForDate, type DayBlock } from "@/lib/blocks";
import { useDayBlocks, useList, useMode, useNow } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { ranOn } from "@/lib/logic/challenge";
import { addDays, dateRange, dayNumber, formatDateLong, formatDuration, formatTime, isDateStr, nyParts, weekdayOf } from "@/lib/logic/dates";
import {
  addBlock,
  findErrand,
  freeTimeFocus,
  insertErrand,
  isMaterialized,
  removeBlock,
  removeErrand,
  stillGoing,
  timerState,
  type ShiftResult,
} from "@/lib/logic/schedule";
import type { DateStr } from "@/lib/types";
import { CalendarSection } from "@/features/calendar/CalendarSection";
import { useCalendarSync } from "@/features/calendar/client";
import { ConflictList, dayIssues } from "@/features/schedule/ConflictList";
import { NowCard } from "@/features/schedule/NowCard";
import { Timeline } from "@/features/schedule/Timeline";
import { WeekStrip } from "@/features/schedule/WeekStrip";
import { resetDay, saveDay } from "@/features/schedule/actions";

const EMPTY_SET: ReadonlySet<string> = new Set();

/** The day asked for in the address, if any. Pages here only render in the browser. */
// Sheets load when first opened, not with the screen.
const AddSheet = dynamic(() => import("@/features/schedule/AddSheet").then((m) => m.AddSheet), { ssr: false });
const BlockSheet = dynamic(() => import("@/features/schedule/BlockSheet").then((m) => m.BlockSheet), { ssr: false });

function readDateParam(): DateStr | null {
  if (typeof window === "undefined") return null;
  const d = new URLSearchParams(window.location.search).get("date");
  return isDateStr(d) ? d : null;
}

/** One line about what a shift did, for the toast. */
function shiftMessage(result: ShiftResult | null, names: Map<string, string>): { text: string; bad: boolean } | null {
  if (!result) return null;
  if (result.conflicts.length > 0) {
    const c = result.conflicts[0];
    return { text: `${names.get(c.id) ?? "A block"} now overlaps ${names.get(c.withId) ?? "a fixed block"}`, bad: true };
  }
  if (result.moved.length === 0) return null;
  const cut = result.moved.find((m) => m.cut > 0);
  if (cut) return { text: `${cut.name} cut by ${formatDuration(cut.cut)} to fit`, bad: false };
  if (result.moved.length === 1) return { text: `${result.moved[0].name} moved to ${formatTime(result.moved[0].to.start)}`, bad: false };
  return { text: `${result.moved.length} blocks shifted later`, bad: false };
}

export default function SchedulePage() {
  const toast = useToast();
  const calendar = useCalendarSync();
  const { challenge } = useMode();

  // A slow clock runs all the time. A one second clock joins in only while a
  // free time block is live, for its countdown.
  const coarse = useNow(5000);
  const [picked, setPicked] = useState<DateStr | null>(readDateParam);
  const [cleared, setCleared] = useState<ReadonlySet<string>>(EMPTY_SET);
  const coarseClock = nyParts(coarse);
  const date = picked ?? coarseClock.date;
  const day = useDayBlocks(date);
  const counting =
    date === coarseClock.date && freeTimeFocus(day.data, coarseClock.minutes * 60 + coarse.getSeconds(), cleared)?.timer.phase === "live";
  const fine = useNow(counting ? 1000 : 60_000);
  const now = counting && fine.getTime() > coarse.getTime() ? fine : coarse;
  const clock = nyParts(now);
  const today = clock.date;
  const isToday = date === today;
  const nowSecondsToday = clock.minutes * 60 + now.getSeconds();

  // ?calendar=... is how the Google sign in reports back. ?date=... (read
  // above) is how the Today banner opens a day.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const result = q.get("calendar");
    if (result) {
      const text: Record<string, string> = {
        connected: "Google Calendar connected",
        denied: "Google sign in was cancelled",
        failed: "Could not connect Google Calendar",
        not_configured: "Google Calendar is not set up on the server",
      };
      toast(text[result] ?? "Calendar updated", { kind: result === "connected" ? "done" : "error" });
    }
    if (result || q.get("date")) window.history.replaceState(null, "", window.location.pathname);
  }, [toast]);

  const template = useList("schedule_template", { eq: { weekday: weekdayOf(date) } });

  const dates = useMemo(() => {
    // The schedule is not tied to a challenge: a few days back and two weeks ahead, always.
    const base = dateRange(addDays(today, -3), addDays(today, 14));
    return base.includes(date) ? base : [...base, date].sort();
  }, [today, date]);
  const rows = useList("schedule_block", { from: dates[0], to: dates[dates.length - 1] });
  const edited = useMemo(() => new Set(rows.data.map((r) => r.date)), [rows.data]);

  // What the screen shows: the saved day, or a change that is on its way in.
  const [pending, setPending] = useState<{ date: DateStr; blocks: DayBlock[] } | null>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const blocks = pending && pending.date === date ? pending.blocks : day.data;
  useEffect(() => {
    // The saved day caught up, so the stand-in can go.
    if (!saving.current) setPending(null);
  }, [day.data]);

  const issues = useMemo(() => dayIssues(blocks), [blocks]);
  const flagged = useMemo(() => new Set(issues.flatMap((i) => i.key.split("|"))), [issues]);
  const errand = findErrand(blocks);
  const own = isMaterialized(day.data);

  const nowSeconds = isToday ? nowSecondsToday : null;

  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ at: number | null } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const open = openId ? (blocks.find((b) => b.id === openId) ?? null) : null;

  const commit = useCallback(
    async (after: DayBlock[], result: ShiftResult | null, done?: string) => {
      if (saving.current) return;
      const before = blocks;
      saving.current = true;
      setBusy(true);
      setPending({ date, blocks: after });
      try {
        await saveDay(date, before, after);
        // Show the saved rows (with their real ids) until the hook catches up.
        setPending({ date, blocks: await getBlocksForDate(date) });
        const note = shiftMessage(result, new Map(after.map((b) => [b.id, b.block_name])));
        if (note) toast(note.text, { kind: note.bad ? "error" : "info" });
        else if (done) toast(done, { kind: "done" });
        if (note?.bad) haptics.error();
      } catch (e) {
        setPending(null);
        toast(e instanceof Error ? e.message : "Could not save that change", { kind: "error" });
      } finally {
        saving.current = false;
        setBusy(false);
        window.setTimeout(() => {
          if (!saving.current) setPending(null);
        }, 900);
      }
    },
    [blocks, date, toast],
  );

  const onStillGoing = (block: DayBlock) => {
    const result = stillGoing(blocks, block.id, nowSeconds !== null ? Math.floor(nowSeconds / 60) : 0);
    setOpenId(null);
    setCleared((s) => new Set(s).add(block.id));
    const to = result.blocks.find((b) => b.id === block.id);
    void commit(result.blocks, result, to ? `${block.block_name} now runs to ${formatTime(to.end)}` : undefined);
  };

  // Open on now, once, when today first shows.
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || day.loading || !isToday || blocks.length === 0) return;
    scrolled.current = true;
    const line = document.querySelector("[data-now-line]");
    if (line) {
      const top = line.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.45;
      if (top > 200) window.scrollTo({ top });
    }
  }, [day.loading, isToday, blocks.length]);

  const inChallenge = !!challenge && ranOn(challenge, date);
  const n = challenge && inChallenge ? dayNumber(challenge.start_date, date) : null;
  const openLive = !!open && nowSeconds !== null && timerState(open, nowSeconds).phase === "live";

  return (
    <Screen>
      <PageHeader
        title="Schedule"
        right={
          <IconLink href="/focus" label="Focus timer">
            <Timer size={22} aria-hidden />
          </IconLink>
        }
      />

      <WeekStrip dates={dates} selected={date} today={today} edited={edited} onSelect={setPicked} />

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="t-h2 truncate">{formatDateLong(date)}</p>
          <p className="t-sub mt-0.5">
            {inChallenge && challenge ? `Day ${n} of ${challenge.length_days}, ` : ""}
            {own ? (inChallenge ? "edited for this day" : "Edited for this day") : inChallenge ? "from the weekday template" : "From the weekday template"}
          </p>
        </div>
        {!isToday ? (
          <Button variant="secondary" size="sm" onClick={() => setPicked(null)}>
            Today
          </Button>
        ) : null}
      </div>

      {isToday && nowSeconds !== null && !day.loading && blocks.length > 0 ? (
        <div className="mt-4">
          <NowCard
            blocks={blocks}
            nowSeconds={nowSeconds}
            cleared={cleared}
            busy={busy}
            onStillGoing={onStillGoing}
            onClear={(b) => {
              haptics.done();
              setCleared((s) => new Set(s).add(b.id));
            }}
          />
        </div>
      ) : null}

      {issues.length > 0 ? (
        <div className="mt-3">
          <ConflictList issues={issues} onOpen={(b) => setOpenId(b.id)} />
        </div>
      ) : null}

      <Card className="mt-3 flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface-2 text-ink-2">
          <MapPin size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">9:00 clock-in errand</p>
          <p className="tnum truncate text-[13px] text-ink-3">
            {errand ? `${formatTime(errand.start)} to ${formatTime(errand.end)}. Tap the block to change it` : "Shifts the morning blocks"}
          </p>
        </div>
        <Toggle
          label="9:00 clock-in errand"
          checked={!!errand}
          disabled={busy || day.loading}
          onChange={(on) => {
            if (on) {
              const result = insertErrand(blocks, { id: `new:errand${Date.now().toString(36)}`, date });
              void commit(result.blocks, result, "Errand added at 9:00 AM");
            } else {
              void commit(removeErrand(blocks, template.data), null, "Errand removed");
            }
          }}
        />
      </Card>

      <Section title="Day" right={blocks.length > 0 ? `${blocks.length} blocks` : undefined}>
        {day.loading ? (
          <Card className="h-[420px]" aria-busy="true" />
        ) : blocks.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={24} aria-hidden />}
            title="Nothing planned"
            body="This weekday has no template yet. Add a block here, or set the template in Settings."
            action={
              <Button onClick={() => setAdding({ at: null })} icon={<Plus size={18} aria-hidden />}>
                Add a block
              </Button>
            }
          />
        ) : (
          <>
            <Timeline
              blocks={blocks}
              nowSeconds={nowSeconds}
              flagged={flagged}
              cleared={cleared}
              disabled={busy}
              onOpen={(b) => setOpenId(b.id)}
              onCommit={(after, result) => void commit(after, result)}
              onAddAt={(minute) => setAdding({ at: minute })}
            />
            <p className="mt-3 px-1 text-[13px] text-ink-3">
              Tap a block to edit it. Press and hold to drag it, or pull the bar on its bottom edge to make it longer or shorter. Blocks with a
              stripe are fixed.
            </p>
            {own ? (
              <Button variant="ghost" size="sm" className="mt-1 -ml-3" icon={<RotateCcw size={16} aria-hidden />} onClick={() => setConfirmReset(true)}>
                Reset this day to the template
              </Button>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Calendar sync">
        <CalendarSection calendar={calendar} />
      </Section>

      {/* add button, above the tab bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--safe-b)+14px)] z-30 mx-auto flex max-w-[480px] justify-end px-5">
        <button
          type="button"
          aria-label="Add a block"
          onClick={() => {
            haptics.tap();
            setAdding({ at: null });
          }}
          className="pressable pointer-events-auto flex size-14 items-center justify-center rounded-full bg-ink text-bg shadow-[0_10px_30px_var(--shadow)]"
        >
          <Plus size={26} aria-hidden />
        </button>
      </div>

      {adding !== null ? (
      <AddSheet
        open
        onClose={() => setAdding(null)}
        date={date}
        blocks={blocks}
        nowMin={nowSeconds !== null ? Math.floor(nowSeconds / 60) : null}
        startAt={adding?.at ?? null}
        onAdd={(block) => {
          setAdding(null);
          void commit(addBlock(blocks, block), null, `${block.block_name}, ${formatTime(block.start)} to ${formatTime(block.end)}`);
        }}
      />
      ) : null}

      {open ? (
      <BlockSheet
        block={open}
        blocks={blocks}
        live={openLive}
        locked={open?.source === "calendar" && calendar.status?.importWritable === false}
        onClose={() => setOpenId(null)}
        onSave={(result) => {
          setOpenId(null);
          void commit(result.blocks, result, "Saved");
        }}
        onDelete={(b) => {
          setOpenId(null);
          void commit(removeBlock(blocks, b.id), null, `${b.block_name} removed`);
        }}
        onStillGoing={onStillGoing}
      />
      ) : null}

      <Sheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset this day?"
        subtitle={`${formatDateLong(date)} goes back to the weekday template. Blocks you added or moved on this day are removed.`}
        footer={
          <div className="flex gap-2">
            <Button full variant="secondary" size="lg" onClick={() => setConfirmReset(false)}>
              Keep it
            </Button>
            <Button
              full
              variant="danger"
              size="lg"
              onClick={() => {
                setConfirmReset(false);
                resetDay(date).then(
                  () => toast("Back on the template"),
                  () => toast("Could not reset the day", { kind: "error" }),
                );
              }}
            >
              Reset
            </Button>
          </div>
        }
      >
        <span />
      </Sheet>
    </Screen>
  );
}
