"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Sheet } from "@/components/ui";
import { citeQuote, isLaw, passageParagraphs, safeUrl, type LibQuote } from "@/lib/logic/library";
import { loadContext, type Library } from "./data";

/**
 * Go deeper: the passage the quote comes from with the quote picked out in it,
 * then who wrote it and the work it is in. The passage file is loaded when
 * this opens. Anything the data leaves empty is not drawn.
 */
export function DeeperSheet({ quote, library, onClose }: { quote: LibQuote; library: Library; onClose: () => void }) {
  const writer = library.writer(quote.writer);
  const work = library.work(quote.writer, quote.work);
  const [passage, setPassage] = useState<{ id: string; text: string | null } | "error" | null>(null);

  useEffect(() => {
    let live = true;
    loadContext(quote.writer).then(
      (all) => live && setPassage({ id: quote.id, text: all[quote.id] ?? null }),
      () => live && setPassage("error"),
    );
    return () => {
      live = false;
    };
  }, [quote.id, quote.writer]);

  const body = useRef<HTMLDivElement>(null);
  const paragraphs = useMemo(() => (passage && passage !== "error" && passage.text ? passageParagraphs(passage.text, quote.text) : []), [passage, quote.text]);
  // A long passage opens with the quote in view.
  useEffect(() => {
    const hit = body.current?.querySelector("mark");
    if (hit && typeof hit.scrollIntoView === "function") hit.scrollIntoView({ block: "center" });
  }, [passage]);
  const law = isLaw(quote);
  const cite = citeQuote(quote, library.workTitle(quote.writer, quote.work));
  const info = law ? undefined : writer?.info;
  const meta = work && !law ? [work.year ? String(work.year) : "", work.translator ? `Translated by ${work.translator}` : ""].filter(Boolean).join(". ") : "";

  return (
    <Sheet open onClose={onClose} title="Go deeper" subtitle={law ? cite.title : `${library.writerName(quote.writer)}, ${quote.location}`}>
      <section aria-label={law ? "Where it came from" : "The passage"}>
        <p className="t-label">{law ? "Where it came from" : "Around it"}</p>
        {passage === null ? (
          <p className="t-sub mt-3" role="status">
            {law ? "Loading the note" : "Loading the passage"}
          </p>
        ) : passage === "error" ? (
          <p className="t-sub mt-3">{law ? "The note did not load. Close this and open it again." : "The passage did not load. Close this and open it again."}</p>
        ) : paragraphs.length === 0 ? (
          <p className="t-sub mt-3">{law ? "There is no origin note for this one." : "There is no longer passage for this one."}</p>
        ) : (
          <div ref={body} className="mt-3 space-y-4 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">
            {paragraphs.map((para, i) => (
              <p key={i}>
                {para.map((piece, j) =>
                  piece.hit ? (
                    <mark key={j} className="bg-transparent font-medium text-ink">
                      {piece.text}
                    </mark>
                  ) : (
                    <span key={j}>{piece.text}</span>
                  ),
                )}
              </p>
            ))}
          </div>
        )}
      </section>

      {law ? (
        <section className="mt-7 border-t border-hair pt-6" aria-label="Attribution and source">
          <p className="t-label">Attributed to</p>
          <p className="t-h2 mt-3">{quote.by || "Unknown"}</p>
          {quote.year ? <p className="t-sub tnum mt-1">{quote.year}</p> : null}
          {cite.source ? (
            <>
              <p className="t-label mt-6">Source</p>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{cite.source}</p>
              {safeUrl(cite.source_url) ? (
                <a href={safeUrl(cite.source_url) ?? undefined} target="_blank" rel="noopener noreferrer" className="pressable tile mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] text-ink">
                  Read the source
                  <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
                </a>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {info ? (
        <section className="mt-7 border-t border-hair pt-6" aria-label="The writer">
          <p className="t-label">The writer</p>
          <p className="t-h2 mt-3">{info.name}</p>
          {info.years ? <p className="t-sub tnum mt-1">{info.years}</p> : null}
          {info.bio ? <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{info.bio}</p> : null}
        </section>
      ) : null}

      {work && !law ? (
        <section className="mt-7 border-t border-hair pt-6" aria-label="The work">
          <p className="t-label">The work</p>
          <p className="t-h2 mt-3">{work.title}</p>
          {meta ? <p className="t-sub mt-1">{meta}</p> : null}
          {work.note ? <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{work.note}</p> : null}
          {work.source_url ? (
            <a
              href={work.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="pressable tile mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] text-ink"
            >
              Read the source
              <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
            </a>
          ) : null}
        </section>
      ) : null}
    </Sheet>
  );
}
