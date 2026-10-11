// Small builders for the Library tests. Not used by the app.

import type { LibQuote, QuoteIndex, QuoteMark } from "./library";

export function q(id: string, writer: string, work: string, over: Partial<LibQuote> = {}): LibQuote {
  return { id, writer, work, text: `Text of ${id}`, location: `Loc ${id}`, plain: `Plain ${id}`, themes: [], moments: [], ...over };
}

/** Two writers: seneca (letters 3, essays 2) and marcus (meditations 3), in reading order. */
export function quotes(): LibQuote[] {
  return [
    q("s1", "seneca", "letters"),
    q("s2", "seneca", "letters"),
    q("s3", "seneca", "letters"),
    q("s4", "seneca", "essays"),
    q("s5", "seneca", "essays"),
    q("m1", "marcus", "meditations"),
    q("m2", "marcus", "meditations"),
    q("m3", "marcus", "meditations"),
  ];
}

export function index(): QuoteIndex {
  return {
    total: 8,
    writers: [
      {
        slug: "seneca",
        name: "Seneca",
        count: 5,
        works: [
          { slug: "letters", title: "Letters to Lucilius", count: 3 },
          { slug: "essays", title: "On the Shortness of Life", count: 2 },
        ],
      },
      { slug: "marcus", name: "Marcus Aurelius", count: 3, works: [{ slug: "meditations", title: "Meditations", count: 3 }] },
    ],
  };
}

export function marks(spec: { read?: string[]; saved?: string[]; at?: string; note?: Record<string, string> } = {}): Map<string, QuoteMark> {
  const out = new Map<string, QuoteMark>();
  const all = quotes();
  const touch = (id: string): QuoteMark => {
    let m = out.get(id);
    if (!m) {
      const found = all.find((x) => x.id === id)!;
      m = { quote_id: id, writer: found.writer, work: found.work, read_at: null, saved_at: null, note: null };
      out.set(id, m);
    }
    return m;
  };
  for (const id of spec.read ?? []) touch(id).read_at = spec.at ?? "2026-10-08T14:00:00.000Z";
  (spec.saved ?? []).forEach((id, i) => (touch(id).saved_at = `2026-10-0${i + 1}T10:00:00.000Z`));
  for (const [id, note] of Object.entries(spec.note ?? {})) touch(id).note = note;
  return out;
}
