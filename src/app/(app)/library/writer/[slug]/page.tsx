"use client";

// One writer: how far through, the works with their own counts, where to
// carry on, and a word on who they were.

import { useParams } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { BigNumber, ButtonLink, EmptyState, PageHeader, ProgressBar, Screen, SectionLabel } from "@/components/ui";
import { readerLink } from "@/lib/logic/library";
import { fraction } from "@/lib/logic/libraryProgress";
import { useLibraryCounts } from "@/features/library/api";
import { indexWriter, useLibraryData } from "@/features/library/data";
import { LibraryProblem } from "@/features/library/LibraryProblem";

const fmt = (n: number) => n.toLocaleString("en-US");

export default function WriterPage() {
  const { slug } = useParams<{ slug: string }>();
  const counts = useLibraryCounts();
  const entry = indexWriter(slug);
  const load = useLibraryData(entry ? [slug] : null);
  const info = load.status === "ready" ? load.library.writer(slug)?.info : undefined;
  const w = counts.writers.find((x) => x.slug === slug);

  if (!entry) {
    return (
      <Screen>
        <PageHeader title="Library" back="/library" />
        <EmptyState title="Not found" body="There is no writer by that name here." />
      </Screen>
    );
  }
  const done = !!w && w.total > 0 && w.read >= w.total;

  return (
    <Screen>
      <PageHeader title={entry.name} eyebrow={info?.years || undefined} back="/library" />
      {counts.problem ? (
        <LibraryProblem problem={counts.problem} retry={counts.retry} />
      ) : counts.ready && w ? (
        <div className="animate-fade-in">
          <section aria-label="Read in this writer">
            <BigNumber size="display" label="Read" value={fmt(w.read)} unit={`of ${fmt(w.total)}`} sub={done ? "All of them." : undefined} />
            <ProgressBar className="mt-4" value={fraction(w)} label={`${entry.name}, read`} />
            <ButtonLink className="mt-5" href={readerLink({ kind: "writer", writer: slug })} size="lg" full>
              {done ? "Read again" : w.read === 0 ? "Start from the first" : "Continue"}
            </ButtonLink>
          </section>

          {w.works.length > 0 ? (
            <section className="mt-7" aria-label="Works">
              <SectionLabel>Works</SectionLabel>
              <div className="mt-1 divide-y divide-hair border-b border-hair">
                {w.works.map((k) => (
                  <Link key={k.slug} href={readerLink({ kind: "writer", writer: slug, work: k.slug })} className="pressable block min-h-[64px] px-1 py-4">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-[15px] text-ink">
                        <span className="truncate">{k.title}</span>
                        {k.total > 0 && k.read >= k.total ? <Check size={16} strokeWidth={2} className="shrink-0 text-accent" aria-label="Finished" /> : null}
                      </span>
                      <span className="t-value tnum shrink-0">
                        {fmt(k.read)}
                        <span className="t-sub"> / {fmt(k.total)}</span>
                      </span>
                    </span>
                    <ProgressBar className="mt-3" value={fraction(k)} label={`${k.title}, read`} />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {info?.bio ? (
            <section className="mt-7" aria-label="About">
              <SectionLabel>About</SectionLabel>
              <p className="mt-3 px-1 text-[15px] leading-relaxed text-ink-2">{info.bio}</p>
            </section>
          ) : null}
        </div>
      ) : null}
    </Screen>
  );
}
