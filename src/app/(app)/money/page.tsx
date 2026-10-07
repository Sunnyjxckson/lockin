"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Link from "next/link";
import { Camera, Check, ChevronRight, DollarSign, Image as ImageIcon, Lock, Plus } from "lucide-react";
import { ActionButton, BigNumber, Button, EmptyState, GlassCard, IconButton, List, ListRow, ProgressBar, Screen, SectionLabel, TopBar, TrackStat } from "@/components/ui";
import { useInstalledOn, useNow } from "@/lib/db/hooks";
import { addDays, formatDateLong, formatDateShort, isDayLocked } from "@/lib/logic/dates";
import { floorStatus, formatHours, formatMoney } from "@/lib/logic/money";
import type { Earning } from "@/lib/types";
import { ScreenshotPicker } from "@/features/money/ScreenshotPicker";
import { useMoney } from "@/features/money/useMoney";
import { CoachLink } from "@/features/coach/CoachLink";

// Sheets load when first opened, not with the screen.
const QuickAddSheet = dynamic(() => import("@/features/money/QuickAddSheet").then((m) => m.QuickAddSheet), { ssr: false });
const ResetTargetSheet = dynamic(() => import("@/features/money/ResetTargetSheet").then((m) => m.ResetTargetSheet), { ssr: false });

export default function MoneyPage() {
  const m = useMoney();
  const now = useNow(60000);
  const installedOn = useInstalledOn();
  const [sheet, setSheet] = useState<{ editing?: Earning; file?: File } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const hit = m.state === "hit";
  const past = m.state === "past";
  const f = m.todayFloor;
  const hours = m.earnings.filter((e) => e.date >= m.historyStart).reduce((sum, e) => sum + (e.hours ?? 0), 0);
  // The amount without its sign, so the sign can be drawn small beside it.
  const bare = (n: number) => formatMoney(n).slice(1);
  const status = !m.hasTarget ? `Floor ${formatMoney(f.floor)}` : hit ? "Target hit" : past ? "Deadline passed" : m.daysLeft === 0 ? "Due today" : `${m.daysLeft} ${m.daysLeft === 1 ? "day" : "days"} left`;

  return (
    <Screen>
      <ScreenshotPicker onFile={(file) => setSheet({ file })}>
        {(pick) => (
          <>
            <TopBar
              title="Money"
              right={
                <>
                  {m.loading ? null : <span className={hit ? "text-accent" : undefined}>{status}</span>}
                  <CoachLink />
                </>
              }
            />

            {m.loading ? null : (
              <div className="animate-fade-in">
                {m.hasTarget ? (
                  <section className="pt-5" aria-label="Money target">
                    <BigNumber
                      label={`Toward ${formatMoney(m.target)}`}
                      prefix="$"
                      value={bare(m.total)}
                      sub={
                        hit
                          ? `${formatMoney(m.total - m.target)} over. Due ${formatDateShort(m.deadline)}.`
                          : past
                            ? `${formatMoney(m.needed.remaining)} short on ${formatDateShort(m.deadline)}.`
                            : `${formatMoney(m.needed.remaining)} to go by ${formatDateShort(m.deadline)}.${m.needed.perDay !== null ? ` ${formatMoney(Math.ceil(m.needed.perDay))} a day gets you there.` : ""}`
                      }
                    />
                    <ProgressBar className="mt-4" value={m.progress} label="Toward the money target" />
                    {m.wasReset && m.since ? (
                      <p className="t-sub tnum mt-3">
                        Counting from {formatDateShort(m.since)}. All time {formatMoney(m.allTime)}.
                      </p>
                    ) : null}
                    {hit || past ? (
                      <Button className="mt-5" variant="secondary" full onClick={() => setResetOpen(true)}>
                        Set a new target
                      </Button>
                    ) : null}
                  </section>
                ) : (
                  <section className="pt-5" aria-label="Earned so far">
                    <BigNumber
                      label="Earned so far"
                      prefix="$"
                      value={bare(m.allTime)}
                      sub={m.challenge ? "This challenge has no money target. The daily floor still counts." : `Since ${formatDateShort(m.historyStart)}. A target comes with a challenge. The floor counts every day.`}
                    />
                    {m.challenge ? (
                      <Button className="mt-5" variant="secondary" full onClick={() => setResetOpen(true)}>
                        Set a target
                      </Button>
                    ) : (
                      <Link href="/settings/challenge" className="pressable glass mt-5 flex h-12 w-full items-center justify-center rounded-full text-[15px] font-medium text-ink">
                        Start a challenge
                      </Link>
                    )}
                  </section>
                )}

                <GlassCard className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="t-label">Today</p>
                      <p className="mt-1.5 flex items-baseline gap-2">
                        <span className="t-h1 tnum">{formatMoney(f.earned)}</span>
                        <span className="tnum text-[14px] text-ink-2">of {formatMoney(f.floor)}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <IconButton filled label="Read a screenshot" onClick={pick}>
                        <Camera size={19} strokeWidth={1.75} aria-hidden />
                      </IconButton>
                      <ActionButton label="Add earnings" onClick={() => setSheet({})}>
                        <Plus size={24} strokeWidth={1.75} aria-hidden />
                      </ActionButton>
                    </div>
                  </div>
                  <ProgressBar className="mt-4" value={f.progress} label="Today against the floor" />
                  <p className="t-sub mt-3 flex items-center gap-1.5">
                    {f.met && f.earned > 0 ? <Check size={14} className="shrink-0 text-accent" aria-hidden /> : null}
                    {f.met && f.earned > 0
                      ? f.over > 0
                        ? `Floor met. ${formatMoney(f.over)} over, banked.`
                        : "Floor met."
                      : `${formatMoney(f.short)} to go.${m.banked > 0 ? " Being ahead does not lower it." : ""}`}
                  </p>
                </GlassCard>

                <div className="mt-6 grid grid-cols-3 gap-3.5 px-1">
                  <TrackStat label="Per hour" value={m.rateOverall !== null ? formatMoney(Math.round(m.rateOverall * 100) / 100) : "$0"} />
                  <TrackStat label="Banked" value={formatMoney(Math.round(m.banked))} />
                  <TrackStat label="Worked" value={formatHours(Math.round(hours * 10) / 10)} />
                </div>

                {m.groceriesThisWeek > 0 ? (
                  <Link href="/meals" className="pressable tile mt-6 flex min-h-[60px] items-center justify-between gap-3 rounded-[20px] px-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-[15px] text-ink">Groceries this week</span>
                      <span className="t-caption mt-0.5 block text-ink-2">Money out, from the meal plan</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="t-value">{formatMoney(m.groceriesThisWeek)}</span>
                      <ChevronRight size={16} className="text-ink-3" aria-hidden />
                    </span>
                  </Link>
                ) : null}

                {m.days.length === 0 ? (
                  <EmptyState
                    className="!py-12"
                    icon={<DollarSign size={22} strokeWidth={1.75} aria-hidden />}
                    title="No earnings yet"
                    body="Add a shift in a few taps, or read it off a screenshot of the earnings screen."
                  />
                ) : (
                  m.days.map((d) => {
                    const s = floorStatus(d.total, m.floor);
                    const locked = isDayLocked(d.date, now, installedOn);
                    const label = d.date === m.today ? "Today" : d.date === addDays(m.today, -1) ? "Yesterday" : formatDateLong(d.date);
                    return (
                      <section key={d.date} className="mt-7" aria-label={label}>
                        <SectionLabel
                          right={
                            <span className="tnum flex items-center gap-1.5">
                              {locked ? <Lock size={12} aria-label="Locked" /> : null}
                              {s.met ? <Check size={13} className="text-accent" aria-label="Floor met" /> : null}
                              <span className={s.met ? "text-accent" : "text-ink"}>{formatMoney(d.total)}</span>
                              {d.rate !== null ? <span className="tracking-normal normal-case">{formatMoney(Math.round(d.rate))}/h</span> : null}
                            </span>
                          }
                        >
                          {label}
                        </SectionLabel>
                        <List className="mt-1.5">
                          {d.entries.map((e) => (
                            <ListRow
                              key={e.id}
                              title={e.app}
                              sub={[e.hours ? formatHours(e.hours) : null, e.hours ? `${formatMoney(Math.round(e.amount / e.hours))}/h` : null].filter(Boolean).join(", ") || "No hours logged"}
                              right={e.screenshot_url ? <ImageIcon size={15} className="text-ink-3" aria-label="Has screenshot" /> : undefined}
                              value={formatMoney(e.amount)}
                              onClick={() => setSheet({ editing: e })}
                            />
                          ))}
                        </List>
                      </section>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </ScreenshotPicker>

      {sheet !== null ? <QuickAddSheet open onClose={() => setSheet(null)} editing={sheet?.editing} file={sheet?.file} defaultApp={m.lastApp} /> : null}
      {m.challenge && resetOpen ? <ResetTargetSheet open onClose={() => setResetOpen(false)} challenge={m.challenge} floor={m.floor} earnedToday={m.todayFloor.earned} allTime={m.allTime} today={m.today} /> : null}
    </Screen>
  );
}
