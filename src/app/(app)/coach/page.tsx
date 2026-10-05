"use client";

import { useState } from "react";
import { CalendarClock, Flag as FlagIcon, History, RefreshCw, Sunrise } from "lucide-react";
import { Button, Card, EmptyState, GlassCard, List, ListRow, PageHeader, Screen, Section, Sheet } from "@/components/ui";
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
          icon={<Sunrise size={22} strokeWidth={1.75} aria-hidden />}
          title="Nothing to read yet"
          body="The first brief lands on your first morning."
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
        coach.brief ? (
          <GlassCard key={coach.brief.body} className="animate-fade-in mt-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="t-label">Morning brief</h2>
              <Button variant="ghost" size="sm" className="-my-3 -mr-3" loading={coach.busy === "morning"} onClick={coach.regenerate} icon={<RefreshCw size={15} strokeWidth={1.75} aria-hidden />}>
                Regenerate
              </Button>
            </div>
            <NoteBody body={coach.brief.body} />
            <SourceTag source={coach.brief.source} className="mt-4 block" />
          </GlassCard>
        ) : coach.writingBrief ? (
          <GlassCard className="mt-2" aria-busy="true">
            <h2 className="t-label mb-4">Morning brief</h2>
            <div className="flex flex-col gap-3" aria-hidden>
              <div className="h-3.5 w-[92%] animate-pulse rounded-full bg-hair" />
              <div className="h-3.5 w-[78%] animate-pulse rounded-full bg-hair" />
              <div className="h-3.5 w-[85%] animate-pulse rounded-full bg-hair" />
            </div>
            <p className="t-sub mt-4">Writing today&apos;s brief.</p>
          </GlassCard>
        ) : (
          <GlassCard pad={false} className="mt-2">
            <EmptyState
              compact
              title="No brief yet"
              body="It could not be written just now."
              action={
                <Button variant="secondary" size="sm" loading={coach.busy === "morning"} onClick={coach.regenerate}>
                  Write it now
                </Button>
              }
            />
          </GlassCard>
        )
      ) : null}

      <Section title="Flags" right={coach.flags.length > 0 ? `${coach.flags.length} active` : null}>
        {coach.flags.length === 0 ? (
          <EmptyState row icon={<FlagIcon size={20} strokeWidth={1.75} aria-hidden />} title="Nothing flagged" body="A pattern needs a few days of data." />
        ) : (
          <div className="divide-y divide-hair border-b border-hair">
            {coach.flags.map((f) => (
              <FlagCard key={f.id} flag={f.note.flag} onDismiss={() => coach.dismiss(f.id)} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Sunday review" right={coach.weekly ? weekLabel(coach.weekly.date) : null}>
        {coach.weekly ? (
          <Card key={coach.weekly.body} className="animate-fade-in !px-5 !py-[18px]">
            <NoteBody body={coach.weekly.body} />
            <div className="mt-4 flex items-center justify-between gap-3">
              <SourceTag source={coach.weekly.source} />
              {coach.due ? (
                <Button variant="ghost" size="sm" className="-my-3 -mr-3" loading={coach.busy === "weekly"} onClick={coach.writeReview} icon={<RefreshCw size={15} strokeWidth={1.75} aria-hidden />}>
                  {coach.reviewMissing ? "Write this week" : "Rewrite"}
                </Button>
              ) : null}
            </div>
          </Card>
        ) : (
          <EmptyState
            row
            icon={<CalendarClock size={20} strokeWidth={1.75} aria-hidden />}
            title={sundayToday ? "This week's review is ready" : `First review lands ${formatDateLong(nextReviewDate(coach.today))}`}
            body={sundayToday ? "It writes itself at 8:00 PM." : "What held, what slipped, one change."}
            action={
              coach.due ? (
                <Button variant="secondary" size="sm" loading={coach.busy === "weekly"} onClick={coach.writeReview}>
                  Write it now
                </Button>
              ) : undefined
            }
          />
        )}
      </Section>

      <Section title="History" right={coach.history.length > 0 ? coach.history.length : null}>
        {coach.history.length === 0 ? (
          <EmptyState row icon={<History size={20} strokeWidth={1.75} aria-hidden />} title="No past notes" body="Earlier briefs, reviews and cleared flags collect here." />
        ) : (
          <List>
            {coach.history.slice(0, 40).map((n) => {
              const t = historyTitle(n);
              return <ListRow key={n.id} title={t.title} sub={t.sub} onClick={() => setOpenId(n.id)} />;
            })}
          </List>
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
