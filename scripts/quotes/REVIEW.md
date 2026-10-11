# Reviewing picks

You are a second reader. Pickers have already chosen quotes and a script has proved each one is word for word in its source. You are not checking wording. You are checking whether each pick belongs in front of the reader.

The reader is a man in his early twenties who reads these one per screen, including on his worst days, to steady himself.

Read every pick file under `scripts/quotes/picks/<writer>/` for the writer you were given. Do not edit those files. Write one file, `scripts/quotes/review/<writer>.json`, a JSON array of the picks to change:

```json
{ "file": "03.json", "text_start": "first 60 characters of the quote text, copied exactly", "action": "drop", "reason": "short reason" }
```

or, to fix only the plain line or tags:

```json
{ "file": "03.json", "text_start": "first 60 characters...", "action": "fix", "plain": "new plain line", "themes": ["fear"], "moments": ["afraid"], "reason": "short reason" }
```

In a fix, include only the fields you are changing (`plain`, `themes`, `moments`).

## Drop when

- It praises, recommends or romanticizes suicide or self-harm, or would read that way with no context (wishing to be dead, death as the way out). Lines about not fearing death, or about life being short, stay.
- Its main point is contempt for a group of people: women, a race, a religion, a nationality, the disabled, the poor. Attacking an idea or a kind of behavior is fine.
- It does not stand alone: it needs the lines before it, depends on a name or plot point, or opens by pointing back at something missing.
- It is flat: plot, scene-setting, a routine remark, or scholarly housekeeping that nobody would stop on.
- It says the same thing as another pick from the same writer in nearly the same words (keep the stronger one, drop the other).

Be strict about the first two and reasonable about the rest. Most picks should survive. Do not drop a line because it is bleak, harsh or uncomfortable: the reader likes the pessimists.

## Fix when

- The plain line gets the meaning wrong, restates the quote almost word for word, hedges, runs past 140 characters, sounds like a greeting card, or contains an em or en dash.
- A theme or moment tag is clearly wrong. Themes: fear, death, time, discipline, adversity, anger, wealth, desire, solitude, friendship, fate, self-mastery, work, pain, reputation, happiness, mind, change, courage, folly, love, power. Moments: overwhelmed, angry, broke, alone, doubting, tempted, tired, afraid.

Plain lines are one line, as a friend would say it, saying the point. Never write an em dash or en dash.

## Finish

Your final reply: counts of drops by reason category and the number of fixes. Nothing else.
