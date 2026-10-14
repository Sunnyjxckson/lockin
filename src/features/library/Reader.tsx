"use client";

// The reader: one quote fills the screen. Swipe, or use the arrows and the
// buttons, for the next one. A quote counts as read by the rule in
// logic/library (countsAsRead). Save in one tap, a note and Go deeper open
// sheets. Finishing a writer or the library is a moment of its own.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, ExternalLink, NotebookPen, RotateCw } from "lucide-react";
import { ActionButton, Button, ButtonLink, EmptyState, IconButton, IconLink, ProgressBar } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { nowIso } from "@/lib/logic/dates";
import { QUOTE_SIZES, citeQuote, countsAsRead, dwellMs, isLaw, quoteStep, safeUrl, scopeQuery, scopeTitle, type LibQuote, type Scope } from "@/lib/logic/library";
import { buildQueue, scopeCounts, scopeQuotes, type Queue } from "@/lib/logic/libraryQueue";
import { fraction, libraryCounts, milestonesAfterRead, type Milestone } from "@/lib/logic/libraryProgress";
import type { LibraryPosition } from "@/lib/types";
import { QUOTE_INDEX, type Library } from "./data";
import { MilestoneMoment } from "./Milestone";
import { PutOnLockScreen } from "./lockscreen/PutOnLockScreen";
import { currentMarks, flushPosition, markRead, savePosition, setNote, setSaved, type QuoteRef } from "./state";
import { prefersReducedMotion, useSwipe } from "./useSwipe";
import type { Marks } from "@/lib/logic/library";

/** Verse is not set smaller than this just to keep a line from wrapping. */
const VERSE_FLOOR = 22;

const NoteSheet = dynamic(() => import("./NoteSheet").then((m) => m.NoteSheet), { ssr: false });
const DeeperSheet = dynamic(() => import("./DeeperSheet").then((m) => m.DeeperSheet), { ssr: false });

export interface ReaderProps {
  scope: Scope;
  /** Open on this quote. */
  startAt: string | null;
  library: Library;
  marks: Marks;
  /** Where the reader was last left, for a second pass to carry on from. */
  position: LibraryPosition | null;
}

interface Session {
  quotes: LibQuote[];
  queue: Queue;
  index: number;
}

function start(scope: Scope, library: Library, marks: Marks, startAt: string | null, after: string | null): Session {
  const quotes = scopeQuotes(scope, library.quotes, marks);
  const queue = buildQueue(scope, quotes, marks, { startAt, after });
  return { quotes, queue, index: queue.start };
}

const refOf = (q: LibQuote): QuoteRef => ({ id: q.id, writer: q.writer, work: q.work });

export function Reader({ scope, startAt, library, marks, position }: ReaderProps) {
  const query = scopeQuery(scope);
  const [session, setSession] = useState<Session>(() => start(scope, library, marks, startAt, position?.scope === query ? position.quote_id : null));
  const [sheet, setSheet] = useState<"note" | "deeper" | null>(null);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const moved = useRef(false);
  const direction = useRef<1 | -1>(1);
  const shown = useRef(false);

  const { queue, index } = session;
  const end = index >= queue.ids.length;
  const quote = end ? null : (library.byId.get(queue.ids[index]) ?? null);
  const mark = quote ? marks.get(quote.id) : undefined;
  const saved = !!mark?.saved_at;
  const title = scopeTitle(scope, library.writerName, library.workTitle);
  const counts = useMemo(() => scopeCounts(session.quotes, marks), [session.quotes, marks]);
  const overall = useMemo(() => libraryCounts(QUOTE_INDEX, marks).overall, [marks]);

  // ---------- moving ----------

  const go = useCallback((delta: 1 | -1) => {
    setSession((s) => {
      const next = Math.min(s.queue.ids.length, Math.max(0, s.index + delta));
      if (next === s.index) return s;
      moved.current = true;
      direction.current = delta;
      return { ...s, index: next };
    });
  }, []);

  const swipe = useSwipe(go, sheet === null && milestone === null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      go(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // ---------- counting a quote as read ----------

  const commit = useCallback((q: LibQuote) => {
    void markRead(refOf(q)).then((fresh) => {
      if (!fresh) return;
      const found = milestonesAfterRead(QUOTE_INDEX, currentMarks(), q.writer);
      if (found.length > 0) {
        haptics.celebrate();
        setMilestone(found[0]);
      }
    });
  }, []);

  const quoteId = quote?.id ?? null;
  useEffect(() => {
    if (!quote) return;
    const text = quote.text;
    let visible = 0;
    let since: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const total = () => visible + (since === null ? 0 : performance.now() - since);
    const arm = () => {
      clearTimeout(timer);
      if (since !== null) timer = setTimeout(() => commit(quote), Math.max(0, dwellMs(text) - total()));
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (since !== null) visible += performance.now() - since;
        since = null;
        clearTimeout(timer);
      } else {
        since = performance.now();
        arm();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    arm();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      const movedPast = moved.current;
      moved.current = false;
      if (countsAsRead({ visibleMs: total(), text, movedPast })) commit(quote);
    };
    // The quote object is stable for an id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, commit]);

  // ---------- remembering where you are ----------

  useEffect(() => {
    if (scope.kind === "saved") return;
    const id = quoteId ?? queue.ids[queue.ids.length - 1] ?? null;
    savePosition({ scope: query, quote_id: id, at: nowIso(), seed: scope.kind === "shuffle" ? scope.seed : (position?.seed ?? null) });
  }, [scope, query, quoteId, queue.ids, position?.seed]);

  useEffect(() => {
    const flush = () => flushPosition();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flushPosition();
    };
  }, []);

  // ---------- drawing the card ----------

  const card = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLQuoteElement>(null);
  const [box, setBox] = useState(0);

  useEffect(() => {
    const el = viewport.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBox(el.clientHeight * 1000 + el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The first size is picked by length. If it still overflows, step down until it fits.
  // Verse also steps down while a line wraps, but not below 22px: past that the lines are small and wrapped anyway.
  useLayoutEffect(() => {
    const vp = viewport.current;
    const tx = text.current;
    if (!vp || !tx || !quote) return;
    const verse = quote.text.includes("\n");
    let step = quoteStep(quote.text);
    const apply = () => {
      tx.style.fontSize = `${QUOTE_SIZES[step]}px`;
    };
    const wraps = () => Array.from(tx.children).some((line) => line.getBoundingClientRect().height > QUOTE_SIZES[step] * 1.2 * 1.4);
    apply();
    while (step < QUOTE_SIZES.length - 1 && (vp.scrollHeight > vp.clientHeight + 1 || (verse && QUOTE_SIZES[step + 1] >= VERSE_FLOOR && wraps()))) {
      step += 1;
      apply();
    }
    vp.scrollTop = 0;
  }, [quote, box]);

  // A new card slides in from the side it came from.
  useLayoutEffect(() => {
    if (!shown.current) {
      shown.current = true;
      return;
    }
    const el = card.current;
    if (!el || prefersReducedMotion() || typeof el.animate !== "function") return;
    el.animate([{ transform: `translateX(${direction.current * 36}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }, [index]);

  const toggleSave = () => {
    if (!quote) return;
    if (saved) haptics.tap();
    else haptics.done();
    void setSaved(refOf(quote), !saved);
  };

  const again = () => {
    const last = queue.ids[queue.ids.length - 1] ?? null;
    setSession(start(scope, library, currentMarks(), null, last));
    moved.current = false;
  };

  const dismissMilestone = useCallback(() => setMilestone(null), []);

  // ---------- empty and end ----------

  if (session.quotes.length === 0) {
    return (
      <Frame back="/library" title={title} right="">
        <EmptyState
          title={scope.kind === "saved" ? "Nothing saved yet" : "Nothing here yet"}
          body={scope.kind === "saved" ? "Tap the bookmark on a quote to keep it." : "No quotes match this one."}
          action={
            <ButtonLink href="/library" variant="secondary">
              Back to the library
            </ButtonLink>
          }
        />
      </Frame>
    );
  }

  const right = queue.review ? `${Math.min(index + 1, queue.ids.length)} of ${queue.ids.length}` : `${counts.read} of ${counts.total}`;
  const label = queue.pass === 2 ? `${title}, second time` : title;

  return (
    <Frame back="/library" title={label} right={right} progress={queue.review ? (queue.ids.length ? Math.min(index + 1, queue.ids.length) / queue.ids.length : 0) : fraction(counts)} progressLabel={`Read in ${title}`}>
      <div ref={viewport} className="no-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain" {...swipe} data-testid="reader-viewport">
        <div ref={card} className="flex min-h-full flex-col justify-center py-4">
          {quote ? (
            <figure key={quote.id}>
              <blockquote ref={text} className="font-medium tracking-[-0.022em] text-ink" style={{ fontSize: `${QUOTE_SIZES[quoteStep(quote.text)]}px`, lineHeight: 1.2 }}>
                {quote.text.split("\n").map((line, i, all) => (
                  <span key={i} className="block" style={all.length > 1 ? { paddingLeft: "1.1em", textIndent: "-1.1em" } : undefined}>
                    {line}
                  </span>
                ))}
              </blockquote>
              <Caption quote={quote} library={library} />
              {quote.plain ? <p className="mt-5 border-t border-hair pt-4 text-[15px] leading-snug text-ink-2">{quote.plain}</p> : null}
            </figure>
          ) : (
            <EndCard queue={queue} scope={scope} title={title} counts={counts} unread={session.quotes.length - counts.read} onAgain={again} />
          )}
        </div>
      </div>

      <div className="shrink-0 pt-2">
        <p className="t-caption tnum flex items-center justify-between text-ink-2">
          <span>
            {overall.read.toLocaleString("en-US")} of {overall.total.toLocaleString("en-US")} in the library
          </span>
          {mark?.read_at && quote ? <span>Read</span> : null}
        </p>
        {quote ? (
          <div className="-mb-1 flex justify-end">
            <PutOnLockScreen quoteId={quote.id} writer={quote.writer} />
          </div>
        ) : null}
        <div className="mt-2 mb-1 flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1">
            <IconButton label="Previous quote" filled disabled={index === 0} onClick={() => go(-1)}>
              <ChevronLeft size={22} strokeWidth={1.75} aria-hidden />
            </IconButton>
            <IconButton label={saved ? "Remove from saved" : "Save"} aria-pressed={saved} disabled={!quote} onClick={toggleSave} className={saved ? "bg-ink text-bg" : "glass text-ink"}>
              <Bookmark size={20} strokeWidth={1.75} fill={saved ? "currentColor" : "none"} aria-hidden />
            </IconButton>
            <IconButton label={mark?.note ? "Edit note" : "Add a note"} filled disabled={!quote} onClick={() => setSheet("note")}>
              <NotebookPen size={19} strokeWidth={1.75} aria-hidden />
            </IconButton>
            <Button variant="secondary" size="sm" disabled={!quote} onClick={() => setSheet("deeper")}>
              Go deeper
            </Button>
          </div>
          <ActionButton label="Next quote" size={56} disabled={end} onClick={() => go(1)}>
            <ChevronRight size={26} strokeWidth={1.75} aria-hidden />
          </ActionButton>
        </div>
      </div>

      {sheet === "note" && quote ? (
        <NoteSheet quote={quote.text} writer={library.writerName(quote.writer)} note={mark?.note ?? ""} onClose={() => setSheet(null)} onSave={(n) => setNote(refOf(quote), n)} />
      ) : null}
      {sheet === "deeper" && quote ? <DeeperSheet quote={quote} library={library} onClose={() => setSheet(null)} /> : null}
      {milestone && sheet === null ? <MilestoneMoment milestone={milestone} total={overall.total} onDone={dismissMilestone} /> : null}
    </Frame>
  );
}

/** Who and where, under the quote. A law reads as its name, who it is attributed to, and its source with a link. */
function Caption({ quote, library }: { quote: LibQuote; library: Library }) {
  const cite = citeQuote(quote, library.workTitle(quote.writer, quote.work));
  const law = isLaw(quote);
  const translator = law ? "" : (library.work(quote.writer, quote.work)?.translator ?? "");
  const href = safeUrl(cite.source_url);
  return (
    <figcaption className="mt-6">
      <p className="t-label text-accent">{law ? cite.title : library.writerName(quote.writer)}</p>
      {law ? null : <p className="t-caption mt-1.5 text-ink-2">{cite.title}</p>}
      {cite.lines.map((l) => (
        <p key={l} className="t-caption mt-1.5 text-ink-2">
          {l}
        </p>
      ))}
      {translator ? <p className="t-caption text-ink-2">Translated by {translator}</p> : null}
      {cite.source ? (
        href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="t-caption -my-1 inline-flex min-h-11 items-center gap-1.5 py-1 text-ink-2 underline decoration-hair underline-offset-4">
            Source: {cite.source}
            <ExternalLink size={13} strokeWidth={1.75} aria-hidden />
          </a>
        ) : (
          <p className="t-caption text-ink-2">Source: {cite.source}</p>
        )
      ) : null}
    </figcaption>
  );
}

function Frame({ back, title, right, progress, progressLabel, children }: { back: string; title: string; right: string; progress?: number; progressLabel?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col px-5 pt-[var(--safe-t)] pb-[calc(var(--tabbar-h)+var(--safe-b))]">
      <div className="-mx-2.5 flex h-12 shrink-0 items-center gap-1 pt-1">
        <IconLink href={back} label="Back to the library">
          <ChevronLeft size={24} strokeWidth={1.75} aria-hidden />
        </IconLink>
        <h1 className="t-label min-w-0 flex-1 truncate">{title}</h1>
        <span className="t-label tnum shrink-0 pr-2.5">{right}</span>
      </div>
      {progress !== undefined ? <ProgressBar value={progress} label={progressLabel} /> : null}
      {children}
    </main>
  );
}

function EndCard({ queue, scope, title, counts, unread, onAgain }: { queue: Queue; scope: Scope; title: string; counts: { read: number; total: number }; unread: number; onAgain: () => void }) {
  const finished = !queue.review && unread === 0;
  return (
    <div className="animate-fade-in text-left">
      <p className="t-label text-accent">{queue.review ? "End of the collection" : finished ? "Finished" : "End of the queue"}</p>
      <p className="t-display tnum mt-4">
        {counts.read}
        <span className="text-[20px] font-normal tracking-normal text-ink-2"> of {counts.total}</span>
      </p>
      <p className="t-sub mt-3">
        {queue.review
          ? "That was all of them."
          : finished
            ? `Every quote in ${title} is read. Going again starts a second time through.`
            : `${unread} in ${title} ${unread === 1 ? "was" : "were"} passed too quickly to count. They are next.`}
      </p>
      <div className="mt-7 flex flex-col gap-3">
        {!queue.review ? (
          <Button size="lg" full icon={<RotateCw size={18} strokeWidth={1.75} aria-hidden />} onClick={onAgain}>
            {finished ? "Go through again" : "Read the rest"}
          </Button>
        ) : null}
        <ButtonLink href={scope.kind === "saved" ? "/library/saved" : "/library"} variant="secondary" size="lg" full>
          {scope.kind === "saved" ? "Back to saved" : "Back to the library"}
        </ButtonLink>
      </div>
    </div>
  );
}
