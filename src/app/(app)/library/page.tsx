"use client";

// The Library: a library of real quotes to finish, like a book. The number
// that matters is how far in you are. From here: carry on, shuffle, pick how
// the day is going, go through one writer or one theme, find one by search.

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bookmark, BookOpen, Check, Search, Shuffle } from "lucide-react";
import { BigNumber, Button, ButtonLink, Chip, EmptyState, IconLink, ProgressBar, Screen, SectionLabel, TopBar } from "@/components/ui";
import { useSettings } from "@/lib/db/hooks";
import { MOMENTS, THEMES, momentLabel, readerLink, scopeFromQuery, scopeTitle, themeLabel } from "@/lib/logic/library";
import { newSeed } from "@/lib/logic/libraryQueue";
import { fraction, percent, savedCount } from "@/lib/logic/libraryProgress";
import { useLibraryCounts, useReadToday } from "@/features/library/api";
import { QUOTE_INDEX, indexWriter } from "@/features/library/data";
import { LibraryProblem } from "@/features/library/LibraryProblem";
import { useMarks } from "@/features/library/state";

const fmt = (n: number) => n.toLocaleString("en-US");

export default function LibraryPage() {
  const router = useRouter();
  const counts = useLibraryCounts();
  const today = useReadToday();
  const { marks, problem, retry } = useMarks();
  const settings = useSettings();
  const position = settings.data?.library_position ?? null;
  const { overall, writers, ready } = counts;
  const saved = savedCount(marks);

  const last = position ? scopeFromQuery(position.scope) : null;
  const finished = overall.total > 0 && overall.read >= overall.total;
  const first = QUOTE_INDEX.writers[0]?.slug;
  const continueTo = last ? readerLink(last) : first ? readerLink({ kind: "writer", writer: first }) : "/library";
  const where = last ? scopeTitle(last, (s) => indexWriter(s)?.name ?? null) : null;

  if (QUOTE_INDEX.total === 0 || QUOTE_INDEX.writers.length === 0) {
    return (
      <Screen>
        <TopBar title="Library" />
        <EmptyState icon={<BookOpen size={22} strokeWidth={1.75} aria-hidden />} title="No quotes yet" body="The quotes ship with the app. This build has none." />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar
        title="Library"
        right={
          <>
            <IconLink href="/library/search" label="Search">
              <Search size={20} strokeWidth={1.75} aria-hidden />
            </IconLink>
            <IconLink href="/library/saved" label="Saved">
              <Bookmark size={20} strokeWidth={1.75} aria-hidden />
            </IconLink>
          </>
        }
      />

      {problem ? (
        <LibraryProblem problem={problem} retry={retry} />
      ) : ready ? (
        <div className="animate-fade-in">
          <section className="pt-5" aria-label="Quotes read">
            <BigNumber
              label="Read"
              value={fmt(overall.read)}
              unit={`of ${fmt(overall.total)}`}
              sub={
                <span className="tnum">
                  {finished ? "All of them" : `${percent(overall)}%`}
                  {today > 0 ? `. ${today} today` : ""}
                </span>
              }
            />
            <ProgressBar className="mt-4" value={fraction(overall)} label="Quotes read in the library" />
          </section>

          <div className="mt-6">
            <ButtonLink href={continueTo} size="lg" full icon={<BookOpen size={19} strokeWidth={1.75} aria-hidden />}>
              {finished ? "Read again" : overall.read === 0 ? "Start reading" : "Continue"}
            </ButtonLink>
            {where && overall.read > 0 ? <p className="t-caption mt-2.5 px-1 text-center text-ink-2">{where}</p> : null}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Button variant="secondary" icon={<Shuffle size={18} strokeWidth={1.75} aria-hidden />} onClick={() => router.push(readerLink({ kind: "shuffle", seed: position?.seed ?? newSeed() }))}>
                Shuffle
              </Button>
              <ButtonLink href="/library/saved" variant="secondary" icon={<Bookmark size={18} strokeWidth={1.75} aria-hidden />}>
                Saved
                <span className="tnum text-ink-2">{saved}</span>
              </ButtonLink>
            </div>
          </div>

          <section className="mt-7" aria-label="Rough day">
            <SectionLabel>Rough day</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              {MOMENTS.map((m) => (
                <Chip key={m} on={false} onClick={() => router.push(readerLink({ kind: "moment", moment: m }))}>
                  {momentLabel(m)}
                </Chip>
              ))}
            </div>
          </section>

          <section className="mt-7" aria-label="Writers">
            <SectionLabel right={`${writers.filter((w) => w.read >= w.total && w.total > 0).length} of ${writers.length} done`}>Writers</SectionLabel>
            <div className="mt-1 divide-y divide-hair border-b border-hair">
              {writers.map((w) => (
                <Link key={w.slug} href={`/library/writer/${w.slug}`} className="pressable block min-h-[64px] px-1 py-4">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-[16px] text-ink">
                      <span className="truncate">{w.name}</span>
                      {w.total > 0 && w.read >= w.total ? <Check size={16} strokeWidth={2} className="shrink-0 text-accent" aria-label="Finished" /> : null}
                    </span>
                    <span className="t-value tnum shrink-0">
                      {fmt(w.read)}
                      <span className="t-sub"> / {fmt(w.total)}</span>
                    </span>
                  </span>
                  <ProgressBar className="mt-3" value={fraction(w)} label={`${w.name}, read`} />
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-7" aria-label="Themes">
            <SectionLabel>Themes</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              {THEMES.map((t) => (
                <Chip key={t} on={false} onClick={() => router.push(readerLink({ kind: "theme", theme: t }))}>
                  {themeLabel(t)}
                </Chip>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </Screen>
  );
}
