# Quote library pipeline

Real quotes from public domain translations, each traced to its source and checked word for word against the full text. Nothing from quote websites.

All commands run from the repo root. Plain Node, no dependencies.

## 1. Fetch and segment

    node scripts/quotes/fetch.mjs              # everything
    node scripts/quotes/fetch.mjs seneca       # one writer
    node scripts/quotes/fetch.mjs --chunks-only

Downloads into `raw/` (cached, skipped if present), then writes:

- `texts/<writer>/<work>.json`: segments with `location`, `title`, `text` (paragraphs split by a blank line, verse kept line by line).
- `chunks/<writer>/NN.txt` and `chunks/index.json`: 25,000 to 35,000 word reading chunks made of whole segments, each preceded by a `### [writer/work] Location: Title` header line.

`raw/`, `texts/`, `chunks/` and `out/` are git ignored and reproducible. The manifest of writers and works is `sources.mjs`. Wikisource needs the descriptive User-Agent already set in `net.mjs`; requests are sequential with backoff.

## 2. Pick

Read a chunk, then write `picks/<writer>/<anything>.json`, an array of:

    { "text": "exact words from the source", "work": "letters", "location": "Letter 13",
      "plain": "one line in plain words on what it means", "themes": ["fear"], "moments": ["overwhelmed"] }

- `work` is the work slug and `location` is the segment location exactly as in the chunk header.
- 1 to 3 sentences, about 60 words at most. Start at a sentence start (or after a colon or semicolon) and end at sentence-ending punctuation. No ellipses, no dropped words.
- Shakespeare: up to 8 verse lines, line breaks as `\n`, no speaker label.
- `plain`: at most 140 characters, no em or en dashes.
- `themes` (1 to 3) and `moments` (1 to 3) must come from `vocab.mjs`.

## 3. Verify

    node scripts/quotes/verify.mjs [writer-slug] [file]

Exits non-zero on any failure and says why. If the text exists in another segment of the same work, it names that location. Allowed differences when matching: whitespace, curly vs straight quotes, dash variants (em, en, double hyphen, spaced hyphen), italic underscores. Nothing else.

## 4. Build

    node scripts/quotes/build.mjs [--out dir]

Default output is `scripts/quotes/out/`. Only picks that pass verification are written, in source order, with exact and near duplicates dropped (the first is kept and the drops are printed). Em and en dashes in quote text and context are replaced.

- `<writer>.json`: writer, works, quotes (`id` is writer-work-location-slug plus a hash of the text, so it stays stable).
- `<writer>.context.json`: quote id to the surrounding passage (the paragraph plus its neighbours, about 1,200 characters).
- `index.json`: totals and per-writer, per-work counts.

Optional `meta.json` supplies writer bios and work notes.

## Manual section: laws and maxims

Named adages like Murphy's law have no single source text, so they are not picked or verified against a book. `manual/laws.json` holds them by hand, each checked against a cited source (fields: `name`, `text`, `by`, `year`, `source`, `source_url`, `plain`, `themes`, `moments`, optional `origin`).
`build.mjs` validates the file (required fields, vocab, `plain` length, no em or en dashes) and fails loudly on a bad entry, then emits it last as the writer `laws` with one work `laws`; `location` is the law's name and quotes also carry `by`, `year`, `source`, `source_url`.
Ids are `laws-<name slug>` (for example `laws-hofstadters-law`), and `laws.context.json` maps each id to its `origin` note.
