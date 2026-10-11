# Picking quotes from a chunk

You are one of many pickers. Each picker reads one chunk of a public domain source text and picks the standout lines from it. The owner of this library wants to read every quote in it, one per screen, like a book. He likes Seneca, the Stoics and the pessimists. He is in his early twenties, building a company, training hard, and uses these lines to get through hard days. Pick lines that would stop him, not filler.

## Your files

- Read: the one chunk file you were given, `scripts/quotes/chunks/<writer>/<nn>.txt`. Read ALL of it, start to finish, in pieces if needed. Do not skim and do not pick from memory.
- Write: exactly one file, `scripts/quotes/picks/<writer>/<nn>.json`. Touch nothing else in the repo. No git commands, no installs.
- Check: `node scripts/quotes/verify.mjs <writer> <nn>.json` from the repo root (`/home/claude/lockin`). If the second argument is not accepted in that form, run `node scripts/quotes/verify.mjs <writer>` and read only the lines about your file. Ignore failures in other pickers' files.

Each segment in the chunk starts with a header line like `### [seneca/letters] Letter 13: On groundless fears`. The part in brackets is `writer/work`. The part after it, up to the colon, is the exact `location` string. Copy `work` and `location` exactly.

## The pick file

A JSON array. One object per quote:

```json
{
  "text": "exact words copied from the chunk",
  "work": "letters",
  "location": "Letter 13",
  "plain": "The dread is worse than the thing.",
  "themes": ["fear"],
  "moments": ["overwhelmed", "afraid"]
}
```

## Rules for `text`

- Copy it character for character from the chunk. Never fix, modernize, trim or join. No ellipses, no dropped words, no paraphrase. If you did not copy it from the file, it does not go in.
- 1 to 3 whole sentences, at most about 60 words. Start at the start of a sentence and end at its end. Shorter is usually better: one sentence that lands beats three that explain.
- It must stand on its own with no setup. If it needs the sentence before it to make sense, or opens with "For", "But", "This", "He" or "Therefore" pointing back at something, skip it or pick the fuller unit.
- Stay inside one paragraph and one segment. Translator brackets like `[I learned]` are part of the text and must be copied.
- Shakespeare: quote verse line by line with `\n` between lines, at most 8 lines, one speaker only, and never include the speaker label. Prefer the lines that carry a thought about life over plot lines.
- No two picks that say the same thing in nearly the same words.

## What to pick

Lines about fear, death, time, discipline, hardship, anger, money and wanting, being alone, friends, fate, mastering yourself, work, pain, what people think of you, happiness, the mind, change, courage, foolishness, love, power. Blunt, concrete, quotable lines. Famous lines from this text must be in if they are in your chunk. Skip: plot summary, anything that depends on names nobody knows, long arguments, religious or scholarly housekeeping, and lines that are only insulting toward a group of people. Never pick a line that recommends or praises suicide or self-harm, or that reads that way out of context: he reads these on his worst days. Lines about facing death without fear are fine.

The task message gives you a target count. Treat it as a guide: go under it if the chunk is thin and over it if the chunk is rich. Spread picks across the whole chunk, not just the start.

## `plain`

One line in plain words on what it means, written by you, as a friend would say it. At most 140 characters. No em dash or en dash characters anywhere. No hedging, no "this quote means", no restating the quote word for word. Say the point.

## `themes` and `moments`

- `themes`: 1 to 3 from: fear, death, time, discipline, adversity, anger, wealth, desire, solitude, friendship, fate, self-mastery, work, pain, reputation, happiness, mind, change, courage, folly, love, power.
- `moments`: 1 to 3 from: overwhelmed, angry, broke, alone, doubting, tempted, tired, afraid. Pick the moment where reading this line would actually help: overwhelmed (too much at once), angry, broke (money stress), alone, doubting (himself or the path), tempted (about to slip on a habit), tired (does not want to do the work), afraid.

## Finish

Run the verifier and fix every failure in your file. A failure almost always means the text was not copied exactly or the location is wrong: go back to the chunk and copy again. If a quote cannot be made to pass, delete it. Do not weaken or reword a quote to get it through. Stop only when your file has zero failures.

Your final reply: one line with the number of quotes that pass and the number you had to drop.
