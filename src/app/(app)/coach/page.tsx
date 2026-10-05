"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Flag as FlagIcon, History, RefreshCw, Sunrise } from "lucide-react";
import { Button, Card, EmptyState, ListRow, PageHeader, Screen, Section, Sheet } from "@/components/ui";
import { FlagCard, FlagDetail, NoteBody, SourceTag, weekLabel } from "@/features/coach/parts";
import { useCoach } from "@/features/coach/useCoach";
import { nextReviewDate, parseFlagNote } from "@/lib/logic/coach";
import { formatDateLong, formatDateShort } from "@/lib/logic/dates";
import type { CoachNote } from "@/lib/types";

function historyTitle(n: CoachNote): { title: string; sub: string } {
  if (n.kind === "morning") return { title: "Morning brief", sub: formatDateLong(n.date) };
  if (n.kind === "weekly") return { title: "Sunday review", sub: weekLabel(n.date) };
  const f = parseFlagNote(n.body);
  const state = f?.resolved_on ? `Cleared ${formatDateShort(f.resolved_on)}` : f?.dismissed_on ? `Dismissed ${formatDateShort(f.dismissed_on)}` : "Flag";
  return { title: f?.flag.title ?? "Flag", sub: `${state} · flagged ${formatDateShort(n.date)}` };
}

export default function CoachPage() {
  const coach = useCoach("always");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = coach.history.find((n) => n.id === openId) ?? null;
  const openFlag = open?.kind === "flag" ? parseFlagNote(open.body) : null;

  if (coach.loading) {
    return (
      <Screen aria-busy="true">
        <PageHeader title="Coach" back="/today" />
      </Screen>
    );
  }

  if (coach.phase === "before") {
    return (
      <Screen>
        <PageHeader title="Coach" back="/today" />
        <EmptyState
          icon={<Sunrise size={24} aria-hidden />}
          title="Nothing to read yet"
          body="The first brief lands on your first morning. From then on the coach reads what you log and says what is slipping."
        />
      </Screen>
    );
  }

  const c = coach.challenge;
  const sundayToday = coach.due && coach.due.weekEnd === coach.today;

  return (
    <Screen>
      <PageHeader
        title="Coach"
        back="/today"
        subtitle={c && coach.dayNumber !== null ? `Day ${coach.dayNumber} of ${c.length_days} · ${formatDateLong(coach.today)}` : formatDateLong(coach.today)}
      />

      {coach.phase === "active" ? (
        <Section title="Morning brief">
          {coach.brief ? (
            <Card key={coach.brief.body} className="animate-fade-in">
              <NoteBody body={coach.brief.body} />
              <div className="mt-4 -mr-2 -mb-2 flex items-center justify-between gap-3 border-t border-line pt-2">
                <SourceTag source={coach.brief.source} />
                <Button
                  variant="ghost"
                  size="sm"
                  loading={coach.busy === "morning"}
                  onClick={coach.regenerate}
                  icon={<RefreshCw size={16} aria-hidden />}
                >
                  Regenerate
                </Button>
              </div>
            </Card>
          ) : coach.writingBrief ? (
            <Card aria-busy="true">
              <div className="flex flex-col gap-3" aria-hidden>
                <div className="h-4 w-[92%] animate-pulse rounded-full bg-surface-3" />
                <div className="h-4 w-[78%] animate-pulse rounded-full bg-surface-3" />
                <div className="h-4 w-[85%] animate-pulse rounded-full bg-surface-3" />
              </div>
              <p className="t-sub mt-4">Reading your data and writing today&apos;s brief.</p>
            </Card>
          ) : (
            <Card padded={false}>
              <EmptyState
                compact
                title="No brief yet"
                body="The brief could not be written just now."
                action={
                  <Button variant="secondary" size="sm" loading={coach.busy === "morning"} onClick={coach.regenerate}>
                    Write it now
                  </Button>
                }
              />
            </Card>
          )}
        </Section>
      ) : null}

      <Section title="Flags" right={coach.flags.length > 0 ? <span className="tnum">{coach.flags.length} active</span> : null}>
        {coach.flags.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              compact
              icon={<FlagIcon size={22} aria-hidden />}
              title="Nothing flagged"
              body="Patterns need a few days of data. When one shows up it lands here with the dates and numbers behind it."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {coach.flags.map((f) => (
              <FlagCard key={f.id} flag={f.note.flag} onDismiss={() => coach.dismiss(f.id)} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Sunday review" right={coach.weekly ? weekLabel(coach.weekly.date) : null}>
        {coach.weekly ? (
          <Card key={coach.weekly.body} className="animate-fade-in">
            <NoteBody body={coach.weekly.body} />
            <div className="mt-4 -mr-2 -mb-2 flex items-center justify-between gap-3 border-t border-line pt-2">
              <SourceTag source={coach.weekly.source} />
              {coach.due ? (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={coach.busy === "weekly"}
                  onClick={coach.writeReview}
                  icon={<RefreshCw size={16} aria-hidden />}
                >
                  {coach.reviewMissing ? "Write this week" : "Rewrite"}
                </Button>
              ) : null}
            </div>
          </Card>
        ) : (
          <Card padded={false}>
            <EmptyState
              compact
              icon={<CalendarClock size={22} aria-hidden />}
              title={sundayToday ? "This week's review is ready to write" : `First review lands ${formatDateLong(nextReviewDate(coach.today))}`}
              body={
                sundayToday
                  ? "It writes itself at 8:00 PM. Or write it now from the week so far."
                  : "What held, what slipped, and one change for the week after."
              }
              action={
                coach.due ? (
                  <Button variant="secondary" size="sm" loading={coach.busy === "weekly"} onClick={coach.writeReview}>
                    Write it now
                  </Button>
                ) : undefined
              }
            />
          </Card>
        )}
      </Section>

      <Section title="History" right={coach.history.length > 0 ? <span className="tnum">{coach.history.length}</span> : null}>
        {coach.history.length === 0 ? (
          <Card padded={false}>
            <EmptyState compact icon={<History size={22} aria-hidden />} title="No past notes" body="Earlier briefs, reviews and cleared flags collect here." />
          </Card>
        ) : (
          <Card padded={false} className="overflow-hidden">
            <div className="divide-y divide-line">
              {coach.history.slice(0, 40).map((n) => {
                const t = historyTitle(n);
                return <ListRow key={n.id} title={t.title} sub={t.sub} onClick={() => setOpenId(n.id)} />;
              })}
            </div>
          </Card>
        )}
      </Section>

      <Sheet
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open ? historyTitle(open).title : undefined}
        subtitle={open ? historyTitle(open).sub : undefined}
        footer={
          open && openFlag && openFlag.dismissed_on && !openFlag.resolved_on ? (
            <Button
              full
              variant="secondary"
              onClick={() => {
                coach.restore(open.id);
                setOpenId(null);
              }}
            >
              Bring this flag back
            </Button>
          ) : undefined
        }
      >
        {open ? (
          openFlag ? (
            <div className="pb-2">
              <FlagDetail flag={openFlag.flag} />
            </div>
          ) : (
            <div className="pb-2">
              <NoteBody body={open.body} />
              <SourceTag source={open.source} className="mt-4 block" />
            </div>
          )
        ) : null}
      </Sheet>
    </Screen>
  );
}
