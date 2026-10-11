"use client";

// Search by word, writer or theme. All writers load when this opens, with a
// loading state, because a word can be anywhere.

import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Chip, EmptyState, PageHeader, Screen, TextField } from "@/components/ui";
import { readerLink, themeLabel } from "@/lib/logic/library";
import { searchQuotes } from "@/lib/logic/librarySearch";
import { QUOTE_INDEX, useLibraryData } from "@/features/library/data";
import { LibraryLoading } from "@/features/library/LibraryLoading";
import { QuoteRow } from "@/features/library/QuoteRow";

const SUGGESTED_THEMES = ["fear", "death", "time", "anger", "pain"];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const typed = useDeferredValue(query);
  const load = useLibraryData("all");
  const library = load.status === "ready" ? load.library : null;
  const result = useMemo(() => (library ? searchQuotes(library.quotes, typed, library.search, 60) : null), [library, typed]);

  return (
    <Screen>
      <PageHeader title="Search" back="/library" />
      <TextField value={query} onChange={setQuery} placeholder="A word, a writer, a theme" aria-label="Search the library" autoFocus />

      {!library ? (
        <LibraryLoading load={load} retry={load.retry} />
      ) : query.trim() === "" ? (
        <div className="mt-6">
          <p className="t-label px-1">Try</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUOTE_INDEX.writers.map((w) => (
              <Chip key={w.slug} on={false} onClick={() => setQuery(w.name)}>
                {w.name}
              </Chip>
            ))}
            {SUGGESTED_THEMES.map((t) => (
              <Chip key={t} on={false} onClick={() => setQuery(t)}>
                {themeLabel(t)}
              </Chip>
            ))}
          </div>
          <p className="t-caption mt-5 px-1 text-ink-2">Looks through the quotes, the plain lines, writers and works.</p>
        </div>
      ) : result && result.total === 0 ? (
        <EmptyState icon={<Search size={22} strokeWidth={1.75} aria-hidden />} title="No match" body="Try one word, or a writer's name." />
      ) : result ? (
        <div className="mt-5">
          <p className="t-label tnum px-1" role="status">
            {result.total > result.hits.length ? `${result.hits.length} of ${result.total}` : result.total} {result.total === 1 ? "result" : "results"}
          </p>
          <div className="mt-2 divide-y divide-hair border-b border-hair">
            {result.hits.map((q) => (
              <QuoteRow key={q.id} href={readerLink({ kind: "writer", writer: q.writer }, q.id)} text={q.text} by={`${library.writerName(q.writer)}, ${q.location}`} />
            ))}
          </div>
        </div>
      ) : null}
    </Screen>
  );
}
