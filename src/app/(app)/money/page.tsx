"use client";

import { useState } from "react";
import { Camera, Check, DollarSign, Image as ImageIcon, Lock, Plus } from "lucide-react";
import { Button, Card, EmptyState, IconButton, ListRow, PageHeader, ProgressBar, Screen, Section, cn } from "@/components/ui";
import { useInstalledOn, useNow } from "@/lib/db/hooks";
import { addDays, formatDateLong, formatDateShort, isDayLocked } from "@/lib/logic/dates";
import { floorStatus, formatHours, formatMoney, normalizeApp } from "@/lib/logic/money";
import type { Earning } from "@/lib/types";
import { QuickAddSheet } from "@/features/money/QuickAddSheet";
import { ResetTargetSheet } from "@/features/money/ResetTargetSheet";
import { ScreenshotPicker } from "@/features/money/ScreenshotPicker";
import { useMoney } from "@/features/money/useMoney";

const MONO: Record<string, string> = { DoorDash: "DD", "Uber Eats": "UE", Instacart: "IC" };

function AppBadge({ app }: { app: string }) {
  const known = normalizeApp(app);
  return (
    <span className="flex size-10 items-center justify-center rounded-full border border-line bg-surface-2 text-[12px] font-bold tracking-wide text-ink-2" aria-hidden>
      {known ? MONO[known] : app.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Mini({ label, value, sub }: { label: string; value: string | null; sub: string }) {
  return (
    <Card className="min-w-0 px-3.5 py-3.5">
      <div className="t-label truncate">{label}</div>
      <div className={cn("t-num-sm tnum mt-1.5 truncate", value === null && "text-ink-3")}>{value ?? "$0"}</div>
      <div className="mt-1 truncate text-[12px] text-ink-3">{sub}</div>
    </Card>
  );
}

export default function MoneyPage() {
  const m = useMoney();
  const now = useNow(60000);
  const installedOn = useInstalledOn();
  const [sheet, setSheet] = useState<{ editing?: Earning; file?: File } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const hit = m.state === "hit";
  const past = m.state === "past";
  const f = m.todayFloor;

  return (
    <Screen>
      <ScreenshotPicker onFile={(file) => setSheet({ file })}>
        {(pick) => (
          <>
            <PageHeader
              title="Money"
              right={
                <>
                  <IconButton label="Read a screenshot" onClick={pick}>
                    <Camera size={22} aria-hidden />
                  </IconButton>
                  <IconButton label="Add earnings" onClick={() => setSheet({})}>
                    <Plus size={24} aria-hidden />
                  </IconButton>
                </>
              }
            />

            {m.loading ? null : (
              <div className="animate-fade-in">
                <Card className="mt-2 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="t-label">Toward {formatMoney(m.target)}</span>
                    <span className={cn("rounded-full border px-2.5 py-1 text-[12px] font-semibold", hit ? "border-accent-line bg-accent-soft text-accent" : "border-line text-ink-2")}>
                      {hit ? "Target hit" : past ? "Deadline passed" : m.daysLeft === 0 ? "Due today" : `${m.daysLeft} ${m.daysLeft === 1 ? "day" : "days"} left`}
                    </span>
                  </div>
                  <div className={cn("t-display tnum mt-3", hit && "text-accent")}>{formatMoney(m.total)}</div>
                  <ProgressBar className="mt-4" value={m.progress} height={10} label="Toward the money target" />
                  <div className="mt-3 flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="text-ink-2">
                      {hit
                        ? `${formatMoney(m.total - m.target)} over. Due ${formatDateShort(m.deadline)}.`
                        : past
                          ? `${formatMoney(m.needed.remaining)} short on ${formatDateShort(m.deadline)}`
                          : `${formatMoney(m.needed.remaining)} to go by ${formatDateShort(m.deadline)}`}
                    </span>
                    {m.state === "active" && m.needed.perDay !== null ? (
                      <span className="tnum shrink-0 font-semibold text-ink">{formatMoney(Math.ceil(m.needed.perDay))} a day</span>
                    ) : null}
                  </div>
                  {m.wasReset && m.since ? (
                    <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3 text-[14px] text-ink-2">
                      <span>Counting from {formatDateShort(m.since)}</span>
                      <span className="tnum">
                        All time <span className="font-semibold text-ink">{formatMoney(m.allTime)}</span>
                      </span>
                    </p>
                  ) : null}
                  {hit || past ? (
                    <Button className="mt-4" variant="secondary" full onClick={() => setResetOpen(true)}>
                      Set a new target
                    </Button>
                  ) : null}
                </Card>

                <Card className="mt-3 p-5">
                  <div className="flex items-center justify-between">
                    <span className="t-label">Today</span>
                    <span className="t-label">Floor {formatMoney(f.floor)}</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className={cn("t-num tnum", f.met && f.earned > 0 && "text-accent")}>{formatMoney(f.earned)}</span>
                    <span className="text-[15px] font-medium text-ink-3">of {formatMoney(f.floor)}</span>
                  </div>
                  <ProgressBar className="mt-3" value={f.progress} tone={f.met ? "accent" : "ink"} label="Today against the floor" />
                  <p className="t-sub mt-3 flex items-center gap-1.5">
                    {f.met && f.earned > 0 ? <Check size={16} className="shrink-0 text-accent" aria-hidden /> : null}
                    {f.met && f.earned > 0
                      ? f.over > 0
                        ? `Floor met. ${formatMoney(f.over)} over, banked.`
                        : "Floor met."
                      : `${formatMoney(f.short)} to go.${m.banked > 0 ? ` Being ahead does not lower it.` : ""}`}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button full size="lg" icon={<Plus size={20} aria-hidden />} onClick={() => setSheet({})}>
                      Add earnings
                    </Button>
                    <Button variant="secondary" size="lg" className="px-4" aria-label="Read a screenshot" onClick={pick}>
                      <Camera size={20} aria-hidden />
                    </Button>
                  </div>
                </Card>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Mini label="Banked" value={m.banked > 0 ? formatMoney(Math.round(m.banked)) : null} sub="Over the floor" />
                  <Mini label="Today" value={m.rateToday !== null ? formatMoney(Math.round(m.rateToday)) : null} sub={m.rateToday !== null ? "An hour" : "No hours yet"} />
                  <Mini label="Overall" value={m.rateOverall !== null ? formatMoney(Math.round(m.rateOverall)) : null} sub={m.rateOverall !== null ? "An hour" : "No hours yet"} />
                </div>

                {m.days.length === 0 ? (
                  <EmptyState
                    className="!py-12"
                    icon={<DollarSign size={24} aria-hidden />}
                    title="No earnings yet"
                    body="Add a shift in a few taps, or read it off a screenshot of the earnings screen."
                  />
                ) : (
                  m.days.map((d) => {
                    const s = floorStatus(d.total, m.floor);
                    const locked = isDayLocked(d.date, now, installedOn);
                    const label = d.date === m.today ? "Today" : d.date === addDays(m.today, -1) ? "Yesterday" : formatDateLong(d.date);
                    return (
                      <Section
                        key={d.date}
                        title={label}
                        right={
                          <span className="flex items-center gap-1.5">
                            {locked ? <Lock size={13} className="text-ink-3" aria-label="Locked" /> : null}
                            {s.met ? <Check size={15} className="text-accent" aria-label="Floor met" /> : null}
                            <span className={cn("tnum font-semibold", s.met ? "text-accent" : "text-ink")}>{formatMoney(d.total)}</span>
                            {d.rate !== null ? <span className="tnum text-ink-3">{formatMoney(Math.round(d.rate))}/h</span> : null}
                          </span>
                        }
                      >
                        <Card padded={false} className="overflow-hidden">
                          <div className="divide-y divide-line">
                            {d.entries.map((e) => (
                              <ListRow
                                key={e.id}
                                left={<AppBadge app={e.app} />}
                                title={<span className="tnum">{formatMoney(e.amount)}</span>}
                                sub={[e.app, e.hours ? formatHours(e.hours) : null, e.hours ? `${formatMoney(Math.round(e.amount / e.hours))}/h` : null].filter(Boolean).join(" · ")}
                                right={e.screenshot_url ? <ImageIcon size={16} className="text-ink-3" aria-label="Has screenshot" /> : undefined}
                                onClick={() => setSheet({ editing: e })}
                              />
                            ))}
                          </div>
                        </Card>
                      </Section>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </ScreenshotPicker>

      <QuickAddSheet open={sheet !== null} onClose={() => setSheet(null)} editing={sheet?.editing} file={sheet?.file} defaultApp={m.lastApp} />
      {m.challenge ? <ResetTargetSheet open={resetOpen} onClose={() => setResetOpen(false)} challenge={m.challenge} earnedToday={m.todayFloor.earned} allTime={m.allTime} today={m.today} /> : null}
    </Screen>
  );
}
