// Search over the quotes: the words of the quote, its plain line, the writer,
// the work and the themes. Every word you type has to be found somewhere;
// whole words beat word starts beat the middle of a word, the quote itself
// beats the plain line, and a writer or a theme named outright ranks high.
// Pure.

import type { LibQuote } from "./library";

export interface SearchContext {
  writerName(slug: string): string;
  workTitle(writer: string, work: string): string;
}

export interface SearchResult {
  /** Best first, cut to the limit. */
  hits: LibQuote[];
  /** How many quotes matched in all. */
  total: number;
}

/** Lowercase, accents and marks gone, anything that is not a letter or digit a space. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface Haystack {
  text: string;
  plain: string;
  writer: string;
  work: string;
  themes: string;
  moments: string;
  location: string;
  length: number;
}

const cache = new WeakMap<LibQuote, { ctx: SearchContext; hay: Haystack }>();

function haystack(q: LibQuote, ctx: SearchContext): Haystack {
  const hit = cache.get(q);
  if (hit && hit.ctx === ctx) return hit.hay;
  const hay: Haystack = {
    text: ` ${normalize(q.text)} `,
    plain: ` ${normalize(q.plain)} `,
    writer: ` ${normalize(ctx.writerName(q.writer))} `,
    work: ` ${normalize(ctx.workTitle(q.writer, q.work))} `,
    themes: ` ${q.themes.map((t) => normalize(t)).join("  ")} `,
    moments: ` ${q.moments.map((t) => normalize(t)).join("  ")} `,
    location: ` ${normalize(`${q.location} ${q.by ?? ""}`)} `,
    length: q.text.length,
  };
  cache.set(q, { ctx, hay });
  return hay;
}

/** Points for one word in one field of padded text: a whole word, the start of a word, the middle of one. */
function inField(field: string, token: string, whole: number, start: number, middle: number): number {
  if (field.includes(` ${token} `)) return whole;
  if (field.includes(` ${token}`)) return start;
  if (token.length >= 3 && field.includes(token)) return middle;
  return 0;
}

/** The score of one quote for the words, or 0 when a word is found nowhere. */
export function scoreQuote(q: LibQuote, tokens: string[], phrase: string, ctx: SearchContext): number {
  const h = haystack(q, ctx);
  let score = 0;
  for (const t of tokens) {
    const here =
      inField(h.text, t, 10, 6, 3) +
      inField(h.plain, t, 4, 3, 1.5) +
      inField(h.writer, t, 8, 5, 0) +
      inField(h.work, t, 5, 3, 0) +
      inField(h.themes, t, 8, 4, 0) +
      inField(h.moments, t, 6, 3, 0) +
      inField(h.location, t, 2, 1, 0);
    if (here === 0) return 0;
    score += here;
  }
  if (tokens.length > 1) {
    if (h.text.includes(` ${phrase} `)) score += 12;
    else if (h.plain.includes(` ${phrase} `)) score += 5;
  }
  // Between equals the shorter quote reads better as a result.
  return score + 2 / (1 + h.length / 200);
}

/** Quotes matching what was typed, best first. An empty query matches nothing. */
export function searchQuotes(quotes: readonly LibQuote[], query: string, ctx: SearchContext, limit = 60): SearchResult {
  const phrase = normalize(query);
  const tokens = Array.from(new Set(phrase.split(" ").filter(Boolean)));
  if (tokens.length === 0) return { hits: [], total: 0 };
  const scored: { q: LibQuote; score: number; order: number }[] = [];
  quotes.forEach((q, order) => {
    const score = scoreQuote(q, tokens, phrase, ctx);
    if (score > 0) scored.push({ q, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return { hits: scored.slice(0, limit).map((s) => s.q), total: scored.length };
}
