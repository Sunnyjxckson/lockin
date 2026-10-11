"use client";

// Your collection: the quotes you saved, newest first, with your notes. A tap
// opens the quote in the reader, which goes on through the collection.

import { useMemo } from "react";
import { Bookmark } from "lucide-react";
import { ButtonLink, EmptyState, PageHeader, Screen } from "@/components/ui";
import { nyParts, formatDateShort } from "@/lib/logic/dates";
import { readerLink } from "@/lib/logic/library";
import { scopeQuotes } from "@/lib/logic/libraryQueue";
import { ALL_WRITERS, useLibraryData } from "@/features/library/data";
import { LibraryLoading } from "@/features/library/LibraryLoading";
import { QuoteRow } from "@/features/library/QuoteRow";
import { LibraryProblem } from "@/features/library/LibraryProblem";
import { useMarks } from "@/features/library/state";

export default function SavedPage() {
  const { marks, ready, problem, retry } = useMarks();
  const writers = useMemo(() => {
    if (!ready) return null;
    return Array.from(new Set(Array.from(marks.values()).filter((m) => m.saved_at).map((m) => m.writer))).filter((w) => ALL_WRITERS.includes(w));
  }, [marks, ready]);
  const load = useLibraryData(writers);
  const savedCount = writers === null ? 0 : Array.from(marks.values()).filter((m) => m.saved_at).length;

  const library = load.status === "ready" ? load.library : null;
  const list = useMemo(() => (library ? scopeQuotes({ kind: "saved" }, library.quotes, marks) : []), [library, marks]);

  return (
    <Screen>
      <PageHeader title="Saved" back="/library" subtitle={ready && savedCount > 0 ? `${savedCount} ${savedCount === 1 ? "quote" : "quotes"}` : undefined} />
      {problem ? (
        <LibraryProblem problem={problem} retry={retry} />
      ) : !ready ? null : savedCount === 0 ? (
        <EmptyState
          icon={<Bookmark size={22} strokeWidth={1.75} aria-hidden />}
          title="Nothing saved yet"
          body="Tap the bookmark on a quote to keep it, and add a note on why it hit."
          action={
            <ButtonLink href="/library/read" variant="secondary">
              Start reading
            </ButtonLink>
          }
        />
      ) : !library ? (
        <LibraryLoading load={load} retry={load.retry} />
      ) : (
        <div className="divide-y divide-hair border-b border-hair">
          {list.map((q) => {
            const m = marks.get(q.id);
            return (
              <QuoteRow
                key={q.id}
                href={readerLink({ kind: "saved" }, q.id)}
                text={q.text}
                by={`${library.writerName(q.writer)}, ${library.workTitle(q.writer, q.work)}`}
                note={m?.note}
                meta={m?.saved_at ? formatDateShort(nyParts(m.saved_at).date) : undefined}
              />
            );
          })}
        </div>
      )}
    </Screen>
  );
}
