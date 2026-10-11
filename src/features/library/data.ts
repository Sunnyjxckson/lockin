"use client";

// Loading the quotes. The index is small and loads with the Library. Each
// writer's file is its own chunk, fetched the first time something needs it
// and kept for the rest of the visit; the passage file for a writer is a
// third chunk, fetched when Go deeper is first opened. Nothing here is
// imported by another tab, so the quotes stay out of their first load.

import { useEffect, useMemo, useState } from "react";
import indexJson from "../../data/quotes/index.json";
import type { IndexWriter, LibQuote, QuoteIndex, WorkInfo, WriterFile, WriterInfo } from "@/lib/logic/library";
import type { SearchContext } from "@/lib/logic/librarySearch";

export const QUOTE_INDEX = indexJson as unknown as QuoteIndex;

export interface WriterData {
  info: WriterInfo;
  works: WorkInfo[];
  quotes: LibQuote[];
}

const done = new Map<string, WriterData>();
const pending = new Map<string, Promise<WriterData>>();

function toData(slug: string, file: WriterFile): WriterData {
  return { info: file.writer, works: file.works, quotes: file.quotes.map((q) => ({ ...q, writer: slug })) };
}

/** One writer's quotes. Cached; a failed load is not cached, so a retry fetches again. */
export function loadWriter(slug: string): Promise<WriterData> {
  const have = done.get(slug);
  if (have) return Promise.resolve(have);
  let p = pending.get(slug);
  if (!p) {
    if (!QUOTE_INDEX.writers.some((w) => w.slug === slug)) return Promise.reject(new Error(`No writer called ${slug}.`));
    p = import(`../../data/quotes/${slug}.json`).then(
      (m: { default: WriterFile }) => {
        const data = toData(slug, m.default);
        done.set(slug, data);
        pending.delete(slug);
        return data;
      },
      (e: unknown) => {
        pending.delete(slug);
        throw e instanceof Error ? e : new Error("Could not load the quotes.");
      },
    );
    pending.set(slug, p);
  }
  return p;
}

/** The passage around each quote of a writer, by quote id. Fetched on first use. */
const contexts = new Map<string, Promise<Record<string, string>>>();

export function loadContext(slug: string): Promise<Record<string, string>> {
  let p = contexts.get(slug);
  if (!p) {
    p = import(`../../data/quotes/${slug}.context.json`).then(
      (m: { default: Record<string, string> }) => m.default,
      (e: unknown) => {
        contexts.delete(slug);
        throw e instanceof Error ? e : new Error("Could not load the passage.");
      },
    );
    contexts.set(slug, p);
  }
  return p;
}

// ---------- the loaded library ----------

/** What has been loaded, in reading order, with the lookups the screens need. */
export interface Library {
  writers: WriterData[];
  /** Every loaded quote: writers as the index lists them, each in source order. */
  quotes: LibQuote[];
  byId: Map<string, LibQuote>;
  writer(slug: string): WriterData | undefined;
  writerName(slug: string): string;
  work(writer: string, work: string): WorkInfo | undefined;
  workTitle(writer: string, work: string): string;
  search: SearchContext;
}

const built = new Map<string, Library>();

/** The library for a set of loaded writers. The same set always gives the same object, so memos downstream hold. */
export function makeLibrary(loaded: readonly WriterData[]): Library {
  const key = loaded.map((w) => w.info.slug).sort().join(",");
  const hit = built.get(key);
  if (hit) return hit;
  const lib = buildLibrary(loaded);
  built.set(key, lib);
  return lib;
}

function buildLibrary(loaded: readonly WriterData[]): Library {
  const order = new Map(QUOTE_INDEX.writers.map((w, i) => [w.slug, i]));
  const writers = loaded.slice().sort((a, b) => (order.get(a.info.slug) ?? 0) - (order.get(b.info.slug) ?? 0));
  const quotes = writers.flatMap((w) => w.quotes);
  const byId = new Map(quotes.map((q) => [q.id, q]));
  const bySlug = new Map(writers.map((w) => [w.info.slug, w]));
  const lib: Library = {
    writers,
    quotes,
    byId,
    writer: (slug) => bySlug.get(slug),
    writerName: (slug) => bySlug.get(slug)?.info.name ?? QUOTE_INDEX.writers.find((w) => w.slug === slug)?.name ?? slug,
    work: (writer, work) => bySlug.get(writer)?.works.find((k) => k.slug === work),
    workTitle: (writer, work) => bySlug.get(writer)?.works.find((k) => k.slug === work)?.title ?? QUOTE_INDEX.writers.find((w) => w.slug === writer)?.works.find((k) => k.slug === work)?.title ?? work,
    search: { writerName: (s) => lib.writerName(s), workTitle: (w, k) => lib.workTitle(w, k) },
  };
  return lib;
}

export function indexWriter(slug: string): IndexWriter | undefined {
  return QUOTE_INDEX.writers.find((w) => w.slug === slug);
}

export const ALL_WRITERS: readonly string[] = QUOTE_INDEX.writers.map((w) => w.slug);

/** Load writers, reporting how many are in. */
export async function loadWriters(slugs: readonly string[], onProgress?: (loaded: number, of: number) => void): Promise<WriterData[]> {
  let n = 0;
  onProgress?.(0, slugs.length);
  return Promise.all(
    slugs.map((s) =>
      loadWriter(s).then((d) => {
        n += 1;
        onProgress?.(n, slugs.length);
        return d;
      }),
    ),
  );
}

export async function loadEverything(): Promise<Library> {
  return makeLibrary(await loadWriters(ALL_WRITERS));
}

/**
 * Find a quote by id. `hint` is the writer when known. Otherwise a writer whose
 * slug starts the id is tried first (ids are written "seneca-letters-letter-12-9f8e7d"), then each
 * writer in turn until the quote turns up.
 */
export async function findQuote(id: string, hint?: string | null): Promise<LibQuote | null> {
  const first = [hint, ...ALL_WRITERS.filter((s) => id.startsWith(`${s}-`) || id.startsWith(`${s}:`))].filter((s): s is string => !!s);
  const tried = new Set<string>();
  for (const slug of [...first, ...ALL_WRITERS]) {
    if (tried.has(slug) || !ALL_WRITERS.includes(slug)) continue;
    tried.add(slug);
    const data = await loadWriter(slug).catch(() => null);
    const hit = data?.quotes.find((q) => q.id === id);
    if (hit) return hit;
  }
  return null;
}

// ---------- hook ----------

export type LibraryLoad =
  | { status: "idle" }
  | { status: "loading"; loaded: number; of: number }
  | { status: "ready"; library: Library }
  | { status: "error"; message: string };

function fromCache(slugs: readonly string[]): Library | null {
  const have = slugs.map((s) => done.get(s));
  return have.every(Boolean) ? makeLibrary(have as WriterData[]) : null;
}

/**
 * The library for the writers a screen needs: a list of slugs, "all", or null
 * for none yet. Ready at once when they were loaded before. Otherwise a
 * loading state with how many files are in, and an error with a retry.
 */
export function useLibraryData(need: readonly string[] | "all" | null): LibraryLoad & { retry: () => void } {
  // By value, so a new array with the same writers is the same request.
  const needKey = need === "all" ? "*" : need ? Array.from(new Set(need)).join(",") : null;
  const slugs = useMemo(() => (needKey === null ? null : needKey === "*" ? ALL_WRITERS : needKey === "" ? [] : needKey.split(",")), [needKey]);
  const key = needKey ?? "";
  const [tries, setTries] = useState(0);
  const [state, setState] = useState<{ key: string; tries: number; load: LibraryLoad }>({ key: "", tries: 0, load: { status: "idle" } });

  useEffect(() => {
    if (!slugs) return;
    if (slugs.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ key, tries, load: { status: "ready", library: makeLibrary([]) } });
      return;
    }
    let live = true;
    loadWriters(slugs, (loaded, of) => live && setState((s) => (s.load.status === "ready" && s.key === key && s.tries === tries ? s : { key, tries, load: { status: "loading", loaded, of } }))).then(
      (data) => live && setState({ key, tries, load: { status: "ready", library: makeLibrary(data) } }),
      (e: unknown) => live && setState({ key, tries, load: { status: "error", message: e instanceof Error ? e.message : "Could not load the quotes." } }),
    );
    return () => {
      live = false;
    };
  }, [slugs, key, tries]);

  const retry = () => setTries((n) => n + 1);
  if (!slugs) return { status: "idle", retry };
  if (state.key === key && state.tries === tries) return { ...state.load, retry };
  const cached = fromCache(slugs);
  if (cached) return { status: "ready", library: cached, retry };
  return { status: "loading", loaded: 0, of: slugs.length, retry };
}
