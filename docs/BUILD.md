# Lock In build conventions

Read docs/PRD.md first. It is the spec. This file is the contract between agents working in this repo at the same time.

The parallel build is over and the integration pass has merged it. The ownership rules below describe how the repo was built and still say where each kind of code lives. One agent working alone may edit shared files, and must keep this document true when it does.

## Stack

- Next.js (App Router, latest stable), TypeScript strict, Tailwind CSS, npm
- Supabase for database, auth-free single user, and photo storage
- Google Calendar API for two-way sync
- Web push (web-push package, VAPID) for reminders
- Claude API (@anthropic-ai/sdk) for the coach and for reading meal and earnings photos
- Vitest for unit tests of pure logic

## Runs with zero credentials

Nobody has provisioned Supabase, Google, VAPID, or Anthropic keys yet. The app must run fully and be usable on `npm run dev` with an empty .env.

- Data: every read and write goes through `src/lib/db` (owned by the foundation agent). It exposes one small generic interface (list, get, insert, update, upsert, remove, with equality and date-range filters) and typed helpers on top. Two backends: Supabase when `NEXT_PUBLIC_SUPABASE_URL` is set, browser localStorage otherwise. Feature code never imports Supabase directly and never touches localStorage directly.
- Photos: `src/lib/storage` with the same split (Supabase Storage, or data URLs in IndexedDB locally).
- AI: each feature owns its route: `src/app/api/coach` (brief and review wording), `src/app/api/body/meal-estimate` (meal photo), `src/app/api/money/read` (earnings screenshot). All three take the model id, the client and the fallback response from `src/lib/ai/server.ts`. With no `ANTHROPIC_API_KEY` they answer 200 `{ source: "fallback", reason: "no_key" }` (the coach route adds the rule-based `body`), never an error screen.
- Calendar and push: with no keys the UI shows a "not connected" state with what to set, and everything else keeps working.
- `.env.example` lists every variable. README.md has the setup steps for each service.

## Rules from the PRD that live in pure functions

Put these in `src/lib/logic/*` with Vitest tests. No React, no db calls inside them.

- Ongoing is the default. Logs are keyed by date and belong to one history that never resets. A challenge is a layer on top (start, length, rules) and starting, ending, finishing or restarting one writes challenge rows only (`logic/challenge`)
- Day number comes from the running challenge's start_date, never stored. With no challenge running there is no day number, only dates
- In ongoing mode the measure is consistency ("26 of the last 30 days"), shown beside streaks, so one slip reads as one day and not as starting over
- The daily floor never drops when the running total is ahead
- Streaks are per item, computed from day_log
- A day can be edited until noon the next day, then it locks
- A day is full when every daily item is done, partial when some are, missed when none are
- Settings changes apply from today forward; past days keep the targets they were scored against (targets are versioned by effective date)
- All dates are local America/New_York calendar dates stored as YYYY-MM-DD strings. Never use toISOString() for a calendar date.

## Ownership (do not edit files outside your area)

- Foundation owns: package.json, config, `src/lib/db`, `src/lib/storage`, `src/lib/logic/{dates,day,streaks,targets}`, `src/lib/types.ts`, `src/lib/seed`, `src/components/ui/*`, `src/app/layout.tsx`, nav, passcode, `src/app/(app)/today`, `src/app/(app)/settings`, `supabase/migrations/0001_init.sql`
- Each feature agent owns `src/app/(app)/<feature>/**`, `src/features/<feature>/**`, `src/lib/logic/<feature>*.ts`, `src/app/api/<feature>/**`
- The three areas being built now, each with a placeholder page already in place:
  - boards: `src/app/(app)/boards/**`, `src/features/boards/**`, `src/lib/logic/boards*.ts`, `src/app/api/boards/**`. Mood boards (PRD 14) and the UI that turns a board's palette into the theme (PRD 15). Tables `board`, `board_item`, `mood_log`, `motivation`. It calls the theme API, it does not edit `src/lib/theme` or `src/lib/logic/theme.ts`
  - meals: `src/app/(app)/meals/**`, `src/features/meals/**`, `src/lib/logic/meals*.ts`, `src/app/api/meals/**`. Meal planning on a budget (PRD 16). Tables `recipe`, `meal_plan`, `grocery_item`, `expense`, and the food fields on `app_settings`
  - focus: `src/app/(app)/focus/**`, `src/features/focus/**`, `src/lib/logic/focus*.ts`, `src/app/api/focus/**`. Study and focus timer (PRD 18). Table `focus_session` and `app_settings.focus_goal_minutes`
- Shared files these three do not touch: everything the foundation owns, plus `src/lib/nav.ts`, `src/lib/theme/*`, `src/lib/logic/{challenge,ongoing,theme}.ts`, `supabase/migrations/*`, `scripts/e2e.mjs`, the docs, and the other features' folders
- Need a new dependency, table column, or shared UI component? Feature agents may add a NEW file (a new migration `supabase/migrations/00NN_<what>.sql`, numbered one above the highest file there with no gaps, which `schema.test.ts` checks, a new component under `src/features/<feature>/`). They do not edit shared files. If a shared file truly must change, make the smallest additive edit and list it in your final report.
- Do not run `npm install` for new packages while other agents are working unless you need to. If you do, use `npm install <pkg>` once and report it.
- Do not run `next build` while other agents are editing (it will fail on their half-written files). Use `npx tsc --noEmit` filtered to your files, and `npx vitest run <your tests>`.

## Design

- A theme is data: a base ("dark minimal" or "high contrast") plus an optional palette, written to CSS variables on the root element. Large numbers, one accent color used only for done states and primary progress. Use the tokens, never a hex color, `white` or `black`: a palette can make the page light.
- Mobile first at 390px wide. Bottom tab bar: Today, Schedule, Money, Body, Progress. Coach and Vices have icons in Today's header. The More button beside them opens Focus, Meals, Boards and Settings. Meals also opens from Body's header and Focus from Schedule's.
- Tap targets 44px minimum. Big type. Short labels.
- Motion: short and smooth, respects prefers-reduced-motion. Haptics through `navigator.vibrate` where available.
- Every screen has a real empty state.

## Copy

- Plain human wording. Short.
- NEVER use an em dash or en dash character anywhere: UI copy, comments, README, commit messages, AI prompts, and AI output (instruct the model, and strip them from responses). Use a period, comma, or "to".
- No emoji in the UI.

## Final report from each agent

A few lines: what works, what is stubbed and behind which env var, any shared file you touched, and anything you could not finish.

## Foundation API

What the foundation gives you. Import from these paths and you should not need to read the source. `/dev/ui` in the dev server shows every component (it answers 404 in a production build).

Also owned by the foundation, beyond the list above: `src/lib/blocks.ts`, `src/lib/auth/*`, `src/lib/haptics.ts`, `src/components/app/*`, `src/app/api/{auth,db,storage}`, `src/app/dev/*`, `src/lib/ai/*`, `src/lib/prefs.ts`, `src/lib/install.ts`, `src/lib/logic/text.ts`, `public/sw.js`, `scripts/*`.

### Conventions

- Types: `import type { Earning, Meal, DateStr, ... } from "@/lib/types"`. Field names are snake_case and match the SQL columns.
- `DateStr` is `"YYYY-MM-DD"` (New York). `TimeStr` is 24 hour `"HH:MM"`. `IsoStr` is an instant. `Weekday` is 0 (Sunday) to 6.
- Ids are strings. Leave `id` and `created_at` out of inserts and they are filled in.
- Every screen under `src/app/(app)/` renders only after the passcode is passed and seed data exists, so the challenge, checklist, template, workouts and reminders are always there.
- Pages are client components (`"use client"`). In local mode the data is in the browser, so nothing can be read during server rendering.

### Tables (`@/lib/types`)

`Tables` maps table name to row type. `TABLE_NAMES` lists them.

| Table | Row type | Notes |
| --- | --- | --- |
| `challenge` | `Challenge` | One row per challenge, at most one with `status: "active"`. `name, status ("active" / "ended" / "succeeded" / "abandoned"), start_date, length_days, ended_on, rules: { item_id, target or null }[] or null, restart_of, money_target, money_deadline, daily_floor, money_target_start`. `rules` null means the whole checklist. `money_target` and `money_deadline` are null for a challenge without a money target. Write it only through the challenge helpers |
| `checklist_item` | `ChecklistItem` | `key, name, type ("yesno" / "number" / "text"), cadence ("daily" / "weekly"), target, category ("habit" / "vice"), mode ("quit" / "cap" / null), unit, hint, sort_order, active, archived, weekly_day, with_photo, tracks_money, typical_spend, spend_period ("day" / "week" / null)`. The last two are the typical spend of a money vice, read with `spendOf(item)` from `logic/vices` |
| `target_version` | `TargetVersion` | `item_id, effective_from, target, active`. Target history. Do not write it by hand, use the helpers |
| `day_log` | `DayLog` | `date, item_id, value, checked, text, completed_at, slips`. One row per item per day. `slips` is the number of `vice_slip` rows for that item and date. Above zero the item is not done that day whatever the tick or number says |
| `vice_slip` | `ViceSlip` | `item_id, date, time, trigger, amount`. After any insert, update or delete call `syncSlipCount(itemId, date)` |
| `schedule_template` | `ScheduleTemplate` | `weekday, block_name, start, end, kind, flexible, note` |
| `schedule_block` | `ScheduleBlock` | `date, block_name, start, end, duration, flexible, kind, note, calendar_event_id, template_id, source` |
| `earning` | `Earning` | `date, amount, app, hours, screenshot_url` |
| `meal` | `Meal` | `date, time, name, photo_url, calories, protein, carbs, fat` |
| `saved_meal` | `SavedMeal` | `name, photo_url, calories, protein, carbs, fat, use_count` |
| `body_log` | `BodyLog` | `date, weight, photo_url`. One row per date |
| `workout` | `Workout` | `weekday, slot ("main" / "core"), name, kind ("lift" / "cardio" / "sport" / "rest"), detail, exercises: { name, sets, reps }[]`. One row per weekday per slot |
| `set_log` | `SetLog` | `date, exercise, set_number, weight, reps` |
| `reminder` | `Reminder` | `kind, label, body, time, block_name, item_id, offset_minutes, enabled, sort_order`. Fires at `time`, or when `time` is null at `offset_minutes` from the start of every block whose name starts with `block_name` |
| `coach_note` | `CoachNote` | `date, kind ("morning" / "weekly" / "flag"), body, source ("ai" / "fallback")` |
| `push_subscription` | `PushSubscriptionRow` | `endpoint, p256dh, auth, user_agent`. Server only in Supabase mode |
| `calendar_token` | `CalendarToken` | `provider, access_token, refresh_token, expires_at, calendar_id, sync_token`. Server only in Supabase mode |
| `reminder_sent` | `ReminderSent` | `date, key`. One row per reminder the scheduled job sent, unique on `key`. Server only |
| `reminder_run` | `ReminderRun` | `last_run_at`. One row, id `"cron"`. Server only |
| `login_attempt` | `LoginAttempt` | `failures, locked_until`. One row, id `"passcode"`. Server only |
| `app_settings` | `AppSettings` | One row, id `"app"`. `seeded, timezone, quiet_start, quiet_end, carbs_target, fat_target, weight_unit, haptics, history_start, daily_floor, weekly_food_budget, food_likes: string[], food_dislikes: string[], focus_goal_minutes`. `history_start` is the first date of the ongoing history. `daily_floor` is the live earnings floor, challenge or not (change it with `setDailyFloor`) |
| `mood_log` | `MoodLog` | `date, time, mood (1 to 5), note` |
| `motivation` | `Motivation` | `kind ("quote" / "clip" / "why"), body, url, sort_order` |
| `board` | `Board` | `name, kind ("body" / "brand" / "life"), cover_item_id, sort_order` |
| `board_item` | `BoardItem` | `board_id, kind ("image" / "color" / "note"), image_url, note, color, palette: string[] or null, source ("camera" / "web" / "screenshot" / "upload"), source_url, sort_order`. `image_url` is a storage reference. `palette` is the colors pulled from the image |
| `theme` | `ThemeRow` | `name, base ("dark" / "contrast"), palette: { background?, surface?, text?, muted?, accent? } or null, accent, board_id, active`. One active row. Do not write it by hand, use `@/lib/theme` |
| `recipe` | `Recipe` | `name, slot ("breakfast" / "lunch" / "dinner" / "snack"), ingredients: { name, quantity, unit, est_cost, category }[], steps: string[], servings, calories, protein, carbs, fat, est_cost, tags: string[], photo_url, source ("seed" / "user" / "ai")`. Macros and cost are for one serving. Nothing is seeded: the meals agent brings the library |
| `meal_plan` | `MealPlan` | `week_start (a Monday, unique), budget, recipe_ids: string[], meals: { date, slot, recipe_id, servings }[], total_cost, store` |
| `grocery_item` | `GroceryItem` | `plan_id, name, quantity, unit, category, store, price, prices: { [store]: number } or null, bought`. `GROCERY_STORES` in `@/lib/types` lists the five stores |
| `expense` | `Expense` | `date, amount, category ("groceries"), note, store, plan_id`. The link between groceries and Money: write one row when a week's list is bought and Money shows "Groceries this week" |
| `focus_session` | `FocusSession` | `date, start, end (null while the timer runs), minutes, label, source ("timer" / "manual"), block_id`. The coach already reads the last two weeks of these |

`Target` is one of `{ kind: "check" }`, `{ kind: "check_by", by }`, `{ kind: "min", min }`, `{ kind: "max", max }`, `{ kind: "range", min, max }`, `{ kind: "text" }`.

Seeded item keys, for `getItemByKey`: `wake, workout, core, calories, protein, earned, study, business, bed, talk, weighin`, and the vices `vice_smoking, vice_drinking, vice_masturbation` (on) plus `vice_vaping, vice_weed, vice_gambling, vice_porn, vice_junk_food, vice_fast_food, vice_energy_drinks, vice_doomscrolling, vice_impulse_spending` (off, `active: false`). Vices are checklist items with `category: "vice"`. Carbs and fat targets are `app_settings.carbs_target` and `fat_target`. Calories and protein targets are the `calories` and `protein` items.

Need a new column or table? Add the next numbered file in `supabase/migrations/` (they run in order: `0001_init`, `0002_reminders`, `0003_vice_spend`, `0004_slip_count`, `0005_money_target_start`, `0006_login_attempt`, `0007_challenges`, `0008_boards_meals_focus`). Use plain `create table name (` and `alter table name add column col type` so `schema.test.ts` can read it. A new table or column also needs its entry in `Tables`, `TABLE_NAMES` and `COLUMNS` (`src/lib/db/schema.ts`), and a server only table goes in `SERVER_ONLY_TABLES`. Rows already on a device have no migration: add a step to `src/lib/db/upgrade.ts`, which runs on every load in local mode and is tested in `upgrade.test.ts` against a version 1 store.

### Data: `@/lib/db`

```ts
import { db, subscribe, notify, isSupabaseMode, isUniqueViolation, type Query } from "@/lib/db";

db.list(table, query?)                 // Promise<Row[]>
db.first(table, query?)                // Promise<Row | null>
db.get(table, id)                      // Promise<Row | null>
db.insert(table, row)                  // Promise<Row>
db.insertMany(table, rows)             // Promise<Row[]>
db.update(table, id, patch)            // Promise<Row>, throws if the id is missing
db.upsert(table, row, conflictColumns) // Promise<Row>, keeps the existing id on update
db.remove(table, id)                   // Promise<void>
db.removeWhere(table, eq)              // Promise<number>, needs at least one column
db.backendName()                       // "local" | "remote" | "supabase" | "memory"

interface Query<K> {
  eq?: Partial<Row<K>>;      // equality on any columns
  from?: DateStr;            // inclusive range on dateField
  to?: DateStr;
  dateField?: string;        // default "date"
  orderBy?: string;
  ascending?: boolean;       // default true
  limit?: number;
}
```

- Everything is typed by table name: `db.list("earning", { from, to })` returns `Earning[]`.
- Always pass `orderBy` when order matters. Without it local returns insert order and Supabase returns `created_at` order.
- `upsert` conflict columns need a unique index in Supabase. These exist: `day_log (date, item_id)`, `target_version (item_id, effective_from)`, `body_log (date)`, `workout (weekday, slot)`, `set_log (date, exercise, set_number)`, `push_subscription (endpoint)`, `calendar_token (provider)`, `reminder_sent (key)`, `meal_plan (week_start)`, and `id` on every table. For any other pair, add a unique index in your migration.
- Every write notifies subscribers of that table. `subscribe(table, fn)` returns an unsubscribe function. The hooks do this for you.
- Errors are `DbError` with a readable message. `insert` fails when a row with the same unique key exists, on both backends, and `isUniqueViolation(e)` tells that apart from other failures (the reminder job uses it as a lock).

### Hooks: `@/lib/db/hooks`

All return `Loadable<T> = { data, loading, error, reload }` unless noted. They re-read after any write to the tables they depend on. `loading` is true only until the first read. Results are cached, so a screen you return to paints at once.

```ts
useList(table, query?)          // Loadable<Row[]>. query may be an inline object
useRow(table, id)               // Loadable<Row | null>
useQuery(key, tables, read, initial) // Loadable<T>. Any async read, re-run when one of `tables` is written
useMode()                       // ModeState. Which mode today is in. Use this, not useChallenge, to decide what to show
useChallenges()                 // Loadable<Challenge[]>. Every challenge, oldest start first
useChallenge()                  // Loadable<Challenge | null>. The row with status "active" (it may not have started, or may be past its last day)
useSettings()                   // Loadable<AppSettings | null>
useChecklist()                  // Loadable<{ items, versions, savedVersions }>. `versions` already has challenge rule targets laid over the days each challenge ran. Score with it
useLogs(from, to?)              // Loadable<DayLog[]>
useDay(date)                    // { summary: DaySummary | null; week: WeekSummary | null; loading }
useWorkouts()                   // Loadable<Workout[]>
useDayBlocks(date)              // Loadable<DayBlock[]>
useToday()                      // DateStr. Today in New York, rolls over at midnight
useNow(everyMs = 30000)         // Date that ticks, and refreshes when the app returns to the front
useInstalledOn()                // DateStr | null. Pass to the lock functions
clearQueryCache()
```

Ongoing or challenge, and today's date:

```ts
const mode = useMode();
// mode.mode          "challenge" while one is running today, otherwise "ongoing"
// mode.challenge     the running challenge or null      mode.day, mode.length, mode.lastDay
// mode.finished      the active challenge once its last day has passed and it still needs closing
// mode.upcoming      the active challenge before its start date
// mode.historyStart  first date of the ongoing history, in both modes
// mode.challenges    every challenge      mode.floor   the daily earnings floor      mode.today, mode.loading
const title = mode.challenge ? `Day ${mode.day} of ${mode.length}` : formatDateShort(mode.today);
const { data: logs } = useLogs(mode.historyStart, mode.today);   // never challenge.start_date
```

Read history from `mode.historyStart`, not from a challenge start: streaks and totals run across challenge boundaries. For a chart or calendar that needs a run of days, `dayWindow(mode, today, ongoingDays)` from `logic/challenge` gives the challenge's days while one runs and a rolling window of plain dates otherwise.

Outside React: `getChallenges()`, `getChallenge()`, `getSettings()` from `@/lib/db/helpers`, `modeOn(challenges, settings.history_start, today)` from `@/lib/logic/challenge`, and `todayNY()` from `@/lib/logic/dates`.

### Typed helpers: `@/lib/db/helpers`

No React. Usable in API routes in Supabase mode.

```ts
getChallenges(): Promise<Challenge[]>         // all, oldest start first
getChallenge(): Promise<Challenge | null>     // the row with status "active"
updateChallenge(patch): Promise<Challenge>    // the active one, throws when there is none
startChallenge({ name, start_date, length_days, rules, money_target?, money_deadline?, daily_floor }, today?)  // throws if one is active
endChallenge(today?)                          // stop early: status "ended", keeps the days it ran
finishChallenge(today?)                       // status "succeeded", only from its last day on
restartChallenge(id?, today?)                 // same name, length and rules from today. The active run becomes "abandoned"
setDailyFloor(floor, today?)                  // settings, the "earned" item target and the active challenge, in step
getScoringVersions(): Promise<TargetVersion[]> // what useChecklist() calls `versions`. Use it wherever days are scored outside React
getSettings(): Promise<AppSettings | null>
updateSettings(patch): Promise<AppSettings>

getItems(): Promise<ChecklistItem[]>          // all, including off and archived
getItemByKey(key): Promise<ChecklistItem | null>
getVersions(): Promise<TargetVersion[]>
addItem({ name, type, cadence?, target?, category?, mode?, unit?, hint?, key?, tracks_money?, weekly_day? }, today?)
saveItem(id, patch, today?)                   // writes a target_version dated today when target or active changed
setItemTarget(id, target, today?)
setItemActive(id, active, today?)             // turn a library vice on or off
removeItem(id, today?)                        // off and archived from today, past days still count it
reorderItems(idsTopToBottom)

getLogs(from, to?): Promise<DayLog[]>
setChecked(itemId, date, checked)             // yes/no and text items
setValue(itemId, date, value | null)          // number items
setText(itemId, date, text)                   // text items
setValueByKey(key, date, value | null)        // number item by seeded key, null if no such item
syncSlipCount(itemId, date)                   // recount vice_slip rows into day_log.slips
logWeight(date, weight | null)                // writes body_log and the weekly weigh-in item

getWorkouts(): Promise<Workout[]>
workoutsFor(all, weekday): { main: Workout | null; core: Workout | null }
resetAllData()
```

Keeping the checklist in step with your feature. Everything is scored from `day_log` only (Today, Progress, streaks, Coach), so:

- Money: after any earning is added, changed or removed, call `setValueByKey("earned", date, totalForThatDate)`. Today's Earned row has no number field: it opens quick add, so the earning table is the only way in.
- Body: after any meal change, call `setValueByKey("calories", date, total)` and `setValueByKey("protein", date, total)`. On Today those two rows take a typed number until a meal is logged that day, then show the meal totals and link to Body. Save weight with `logWeight(date, weight)`.
- Vices: after a slip is added, moved or removed, call `syncSlipCount(itemId, date)`. That is the one source of truth for a slip: `itemState` returns `"off"` while `day_log.slips` is above zero, and a slip today ends the streak that day. The tick and number are left alone, so removing the slip puts the day back. Turn library vices on with `setItemActive`. A capped vice is `type: "number"`, `mode: "cap"`, target `{ kind: "max", max }`.
- `app_settings.daily_floor` and the `earned` item's target are the same number, and `challenge.daily_floor` follows while one is active. Change it with `setDailyFloor` only. Read the floor from `useMode().floor` or `getSettings()`.
- None of the challenge helpers touch a log, a target version or a checklist item. Keep it that way: nothing a challenge does may change the ongoing history.

### Photos: `@/lib/storage`

```ts
import { uploadPhoto, resolvePhoto, photoAsDataUrl, removePhoto, resizeImage, blobToDataUrl } from "@/lib/storage";
import { usePhoto } from "@/lib/storage/hooks";

uploadPhoto(file: Blob, { folder?, maxSize = 1600, quality = 0.82 }): Promise<string>  // the reference to store in a *_url column
resolvePhoto(ref): Promise<string | null>     // a URL an <img> can load
usePhoto(ref): string | null                  // same, as a hook
photoAsDataUrl(ref): Promise<string | null>   // for sending to an AI route
removePhoto(ref): Promise<void>
```

A stored reference is `"idb:<id>"` locally or a public URL in Supabase mode. Never put a reference straight into `src`, always resolve it. Browser only.

### Logic: `@/lib/logic/*`

Pure, tested, no db.

`dates`:

```ts
TIME_ZONE                                   // "America/New_York"
todayNY(now?): DateStr                      timeNY(now?): TimeStr
nyParts(at?: Date | IsoStr): { date, time, hour, minute, minutes, weekday }
nowIso(now?): IsoStr                        // for timestamps
addDays(date, n)   diffDays(a, b)   weekdayOf(date)   dateRange(a, b)   isDateStr(s)
dayNumber(startDate, date)                  // day 1 is the start date
dateOfDay(startDate, day)   challengeEndDate(startDate, lengthDays)
isInChallenge(startDate, lengthDays, date)  challengeDates(startDate, lengthDays)
weekStart(date)  weekEnd(date)  weekDates(date)   // Monday to Sunday
minutesOf(time)  timeFromMinutes(m)  addMinutes(time, delta)  durationMinutes(start, end)  isTimeStr(s)
formatTime("06:30")      // "6:30 AM"
formatDuration(95)       // "1h 35m"
formatDateLong(date)     // "Monday, Oct 5"
formatDateShort(date)    // "Oct 5"
nyInstant(date, time): Date
lockInstant(date, installedOn?): Date
isDayLocked(date, now?, installedOn?): boolean
isDayEditable(date, now?, installedOn?): boolean   // not in the future and not locked
```

Never build a calendar date from `toISOString()`. Use `todayNY()`, `nyParts()` and `addDays()`.

`challenge` (ongoing mode and challenges):

```ts
modeOn(challenges, historyStart, today): ModeInfo   // what useMode() wraps
activeChallenge(challenges)   challengePhase(c, today): "upcoming" | "running" | "finished" | "closed"
plannedEnd(c)   lastDay(c)   ranOn(c, date)   daysRun(c, today)   pastChallenges(challenges)   STATUS_LABEL
dayWindow(mode, today, ongoingDays = 30): { start, length, numbered, name }
challengeItems(c, items)      // the items a challenge counts. Null rules: all of them
ruleTarget(c, itemId)         // the target a challenge holds an item to, or null
challengeDay(c, daySummary)   // the same day counted by the challenge's items only
scoringVersions(versions, challenges)   // saved versions with rule targets laid over each challenge's days
consistency(statusByDate, today, from, window = 30): { full, partial, days, window, percent }
consistencyLabel(c)           // "26 of the last 30 days", "3 of 4 days", "First day"
challengeRecord(c, statusByDate, today): { days, length, full, partial, missed }
challengeProblem(input, today)   newChallengeRow(input)   endPatch   finishPatch   canFinish   restartRows
```

`ongoing` (progress that does not end): `ongoingCells`, `statusByDate`, `tally`, `ongoingWeeks(input, max)`, `ongoingMonths(input, max)`, `ongoingHeadline(status, historyStart, today)`, `ongoingCardData`. Input is `{ historyStart, today, items, versions, logs }`.

`day`:

```ts
type DayStatus = "full" | "partial" | "missed";
type ItemState = "done" | "open" | "off";      // off: logged but does not meet the target
meetsNumber(target, value): boolean            hasSlip(log): boolean
itemState(item, target, log): ItemState        isItemDone(item, target, log): boolean
summarizeDay(date, items, versions, logs): DaySummary
  // { date, status, done, total, percent, items: { item, target, log, state, done }[] }, daily items only
dayStatus(date, items, versions, logs): DayStatus
summarizeWeek(date, items, versions, logs, asOf?): WeekSummary
  // { weekStart, weekEnd, items: { item, target, log, done, doneOn }[], done, total, complete }, weekly items only
statusFromCounts(done, total): DayStatus       logsByItem(logs, date): Map<itemId, DayLog>
```

`logs` can span many days. `summarizeDay` returns `"missed"` for a day with nothing done, including future days, so decide for yourself how to draw days after today.

`streaks`:

```ts
itemStreak(item, versions, logs, today, from): { current, best, doneNow }   // from = the history start, so streaks cross challenge boundaries
allStreaks(items, versions, logs, today, from): Record<itemId, Streak>
fullDayStreak(statusByDate, today, from): number
```

Daily items count days, weekly items count weeks. Today (or this week) not being done yet does not break a streak. A slip logged today does: the current streak is 0 from that moment.

`targets`:

```ts
versionOn(versions, itemId, date)      targetOn(item, versions, date)      isActiveOn(item, versions, date)
scoredItems(items, versions, date): { item, target }[]   // the checklist as it stood on that date, in order
describeTarget(target, unit?)          // "1,900 to 2,100 kcal", "180g or more", "$100 or more"
defaultTarget(type)   targetsEqual(a, b)   versionForChange(itemId, today, target, active)   BASELINE_DATE
```

Typical use for a grid or a streak list:

```ts
const { data: { items, versions } } = useChecklist();
const mode = useMode();
const { data: logs } = useLogs(mode.historyStart, mode.today);
const status = summarizeDay(date, items, versions, logs).status;
const streaks = allStreaks(items.filter((i) => i.active), versions, logs, mode.today, mode.historyStart);
```

Your own rules go in `src/lib/logic/<feature>*.ts` (the floor rule belongs to Money, for example).

### Theme: `@/lib/theme` and `@/lib/logic/theme`

A theme is a base plus an optional palette. `logic/theme` (pure, tested) turns any palette into a full set of tokens and holds every pair the app draws to WCAG AA (4.5 to 1, and 7 to 1 on the high contrast base), moving a color along its own lightness when it fails. `lib/theme` (client) puts the result on the root element as CSS variables, saves it in the `theme` table and keeps a copy on the device, which an inline script in the root layout applies before first paint.

```ts
import { setThemeFromPalette, resetTheme, setBaseTheme, previewTheme, useTheme, getTheme } from "@/lib/theme";

setThemeFromPalette(palette, { boardId?, name?, base? }): Promise<Theme>   // save it and paint it
resetTheme(): Promise<Theme>                  // drop the palette, keep the base
setBaseTheme("dark" | "contrast"): Promise<Theme>
previewTheme(palette | null, base?): Theme    // paint without saving. null goes back to the saved theme
useTheme()   // { base, palette, boardId, name, theme, previewing, setBase, setFromPalette, reset, preview }
getTheme()   // the same state outside React

// palette: { background?, surface?, text?, muted?, accent? }, each "#rrggbb". Leave any out and the base supplies it.
// theme.tokens: bg, surface, surface-2, surface-3, line, line-strong, ink, ink-2, ink-3, accent, accent-ink, danger, warn
// theme.scheme: "dark" | "light"      theme.adjusted: the tokens that were moved to stay readable
```

From `@/lib/logic/theme`, for a palette picker that wants to show the result before applying it: `buildTheme(base, palette)`, `auditTheme(theme)`, `contrast(a, b)`, `ensureContrast(fg, backgrounds, min)`, `normalizeHex`, `cleanPalette`, `mix`, `luminance`, `BASE_THEMES`. `ThemePicker` in `@/components/app/ThemePicker` is the base picker Settings uses, and can be mounted elsewhere.

### Schedule blocks: `@/lib/blocks`

The one function Today uses:

```ts
getBlocksForDate(date: DateStr): Promise<DayBlock[]>
```

It returns the `schedule_block` rows for the date when there are any, otherwise the day built from `schedule_template` for that weekday, sorted by start. So the Schedule feature does not replace anything: write `schedule_block` rows for a day (copy the template blocks in the first time the day is edited, with `source: "template"` and `template_id` set) and Today, and every other reader, picks them up. Deleting all of a day's rows puts it back on the template.

```ts
interface DayBlock { id, date, block_name, start, end, duration, flexible, kind, note,
                     calendar_event_id, template_id, source, persisted }
// persisted is false and id is "template:<id>" when the block was derived from the template

useDayBlocks(date)                       // from "@/lib/db/hooks"
blocksFromTemplate(date, templateRows)   resolveBlocks(date, blockRows, templateRows)
nowAndNext(blocks, time): { now, next, minutesLeft, minutesUntilNext }
```

Block kinds: `wake, workout, home, class, delivery, basketball, study, bed, free, errand, other`. Delivery blocks are named `Delivery`, `Delivery: lunch`, `Delivery: dinner`, `Delivery: late night`, all with `kind: "delivery"`.

### Text from a model: `@/lib/logic/text`

```ts
stripDashes(text)        // a dash between numbers becomes "to", any other becomes ", "
cleanLine(text, max)     // stripDashes, whitespace folded, cut to max. For short fields
```

Everything a model wrote goes through one of these before it is stored or shown. `cleanCoachText` in `logic/coach` builds on `stripDashes`.

### AI routes: `@/lib/ai/server`

Server only. The three AI routes use nothing else to reach Claude.

```ts
DEFAULT_ANTHROPIC_MODEL          // "claude-sonnet-5-5", a current Sonnet with vision
anthropicModel(): string         // ANTHROPIC_MODEL if set, else the default
anthropicClient(opts?)           // Anthropic | null. Null when ANTHROPIC_API_KEY is unset
aiFallback(reason, extra?)       // 200 { ...extra, source: "fallback", reason }
readImageDataUrl(image)          // { mediaType, data } or { error: Response }
```

`reason` is one of `no_key, no_read, error, bad_image, refused, empty, too_long, numbers_not_in_data`. A success is `{ source: "ai", ... }`.

### Device preferences and install: `@/lib/prefs`, `@/lib/install`

```ts
getPref(key): string | null      setPref(key, value | null)   // per device, not app data
installMode(): "prompt" | "ios" | "ios-other" | "none"        promptInstall(): Promise<boolean>
isIOS()   isStandalone()   subscribeInstall(fn)
```

`prefs` is for things like a dismissed prompt. App data still goes through `db`.

### Auth: `@/lib/auth/server`

Every API route you add must start with this:

```ts
import { requireAuth } from "@/lib/auth/server";

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  ...
}
```

It returns a 401 response when `LOCKIN_PASSCODE` is set and the cookie is missing, otherwise null. Routes called by a cron job cannot carry the cookie, so guard those with their own secret.

Login tries go through `tryLogin` in `@/lib/auth/limiter`: every 5 wrong tries in a row lock the login, 1 minute at first and doubling up to an hour. The count is in the `login_attempt` table in Supabase mode, so it holds across serverless instances, and in module memory in local mode.

Server routes and data: in local mode the server has no data (it is in the browser). An API route that needs data must be sent it in the request body. Only in Supabase mode can a route call `db` and the helpers directly. Features that need the server to act alone (scheduled push) need Supabase, and should say so in their not connected state.

### UI: `@/components/ui`

```ts
import { Button, Card, Sheet, ... } from "@/components/ui";
```

Icons come from `lucide-react` (installed), usually at size 18 to 24.

| Component | Props |
| --- | --- |
| `Screen` | `children, className?`. Page container: centered column up to 480px, 20px side padding, room for the tab bar. Wrap every page in it |
| `PageHeader` | `title, eyebrow?, subtitle?, back? (href), right? (node)`. With `back` (every sub-screen) there is a back arrow row above the title and `right` sits on that row. Without it (tab screens) `right` sits on the title line |
| `Section` | `title, right?, children`. Uppercase eyebrow then content, with top margin |
| `Card` | `padded? = true, raised? = false`, plus div props. Use `padded={false}` with `overflow-hidden` for lists |
| `ListRow` | `title, sub?, left?, right?, href?, onClick?, plain?`. Stack inside `<Card padded={false}><div className="divide-y divide-line">` |
| `Button` | `variant? ("primary" / "secondary" / "ghost" / "danger"), size? ("sm" / "md" / "lg"), full?, loading?, icon?`, plus button props |
| `IconButton` | `label (required), filled?`, plus button props. 44px round |
| `IconLink` | `href, label (required), children`. The same shape as a link, for a header's `right` slot |
| `Sheet` | `open, onClose, title?, subtitle?, footer?, children`. Bottom sheet. Follows the visual viewport, so it stays above the on-screen keyboard. Import sheet components with `next/dynamic` and render them only while open, so their code loads on first use |
| `NumberField` | `value: number | null, onChange(value), live?, label?, hint?, unit?, prefix?, placeholder?, min? = 0, max?, decimal? = true, disabled?, variant? ("field" / "inline" / "hero"), done?, autoFocus?`. `onChange` fires on blur or Enter. Pass `live` for every keystroke |
| `TextField` | `value, onChange(value), onCommit?(value), label?, hint?, error?, placeholder?, rows?, maxLength?, disabled?, autoFocus?` |
| `TimeField` | `value ("HH:MM"), onChange, label?, hint?, disabled?` |
| `DateField` | `value ("YYYY-MM-DD"), onChange, label?, hint?, min?, max?, disabled?` |
| `Select` | `value, onChange, options: { value, label }[], label?, hint?, disabled?` |
| `Field` | `label, hint?, error?, htmlFor?, children`. Label wrapper for a custom control |
| `Toggle` | `checked, onChange, label?, disabled?` |
| `Checkbox` | `checked, onChange, label (required), off?, disabled?, size? = 30`. The done tick, with haptics |
| `CheckMark` | `checked, off?, size?`. The tick drawing only, for rows that handle the tap themselves. Animates when `checked` turns true |
| `SegmentedControl` | `options: { value, label }[], value, onChange, label?, size? ("sm" / "md"), disabled?` |
| `ProgressRing` | `value (0 to 1), size? = 88, stroke?, tone? ("accent" / "ink" / "warn"), label?, children? (center)` |
| `ProgressBar` | `value (0 to 1), height? = 8, tone?, marker? (0 to 1), label?` |
| `Stat` | `label, value, unit?, sub?, size? ("display" / "lg" / "sm"), done?, align?`. A big numeral with a label |
| `EmptyState` | `title, body?, icon?, action?, compact?` |
| `useToast()` | `toast(message, { kind?: "info" / "done" / "error", duration? })`. The provider is already mounted |
| `TabBar` | No props. Already rendered by the app layout, do not render it again. A tab is lit on its own sub-routes. Today is also lit on `/coach`, `/vices`, `/reminders`, `/settings` and `/boards`, Body on `/meals`, Schedule on `/focus`. The lists are in `src/lib/nav.ts` |
| `cn(...)` | Joins class names |

Haptics: `import { haptics } from "@/lib/haptics"`, then `haptics.tap()`, `haptics.done()`, `haptics.celebrate()`, `haptics.error()`. `Checkbox`, `Toggle` and `SegmentedControl` already call it.

### Tokens

The defaults are in `src/app/globals.css` and the live values come from the theme. Use the Tailwind names. Do not write hex colors, `white`, `black` or `rgba()`: a palette can make the page light, and `theme.test.ts` fails on a color outside the token block.

| Tailwind | CSS variable | Use |
| --- | --- | --- |
| `bg-bg` | `--bg` | Page background |
| `bg-surface`, `bg-surface-2`, `bg-surface-3` | `--surface`, `--surface-2`, `--surface-3` | Cards, controls inside cards, tracks |
| `border-line`, `border-line-strong` | `--line`, `--line-strong` | Borders and dividers |
| `text-ink`, `text-ink-2`, `text-ink-3` | `--ink`, `--ink-2`, `--ink-3` | Primary, secondary, faint text |
| `bg-accent`, `text-accent`, `text-accent-ink`, `bg-accent-soft`, `border-accent-line` | `--accent` and friends | Done states and primary progress only |
| `text-danger`, `bg-danger-soft` | `--danger` | Destructive actions and errors |
| `text-warn`, `bg-warn-soft` | `--warn` | Logged but does not count, over a limit |
| `bg-scrim`, `text-on-scrim` | `--scrim`, `--on-scrim` | What dims the page behind a sheet or over a photo, and text on it |
| `shadow-[0_8px_30px_var(--shadow)]` | `--shadow` | Drop shadows |

Text on `bg-ink` is `text-bg`. Text on `bg-accent` is `text-accent-ink`. Anything drawn in inline SVG or on a canvas reads `var(--token)`.

Buttons, selected segments and switches use ink, not the accent, so the accent always means done.

Type classes: `t-display` (64px hero numeral), `t-num` (40px), `t-num-sm` (28px), `t-title` (28px page title), `t-h2` (20px), `t-sub` (14px secondary), `t-label` (12px uppercase eyebrow), `tnum` (tabular figures). Body text is 16px with no class.

Other utilities: `pressable` (press feedback), `no-scrollbar`, and the animations `animate-fade-in`, `animate-rise-in`, `animate-sheet-up`, `animate-toast-in`, `animate-check-pop`, `animate-shake`, `animate-ring-glow`, `animate-pulse-dot`, and `animate-day-ring`, `animate-day-check`, `animate-day-text` for the full day moment. All motion is switched off under `prefers-reduced-motion`.

Layout variables: `--tabbar-h` (60px), `--safe-b`, `--safe-t`. Anything fixed to the bottom of the screen sits at `bottom-[calc(var(--tabbar-h)+var(--safe-b))]`. Radii: cards 20px, controls 14px, small controls 12px.

### Pages

A stub page looks like this, and yours should keep the same frame:

```tsx
"use client";
import { PageHeader, Screen } from "@/components/ui";

export default function MoneyPage() {
  return (
    <Screen>
      <PageHeader title="Money" />
      ...
    </Screen>
  );
}
```

Routes that exist: `/today`, `/schedule`, `/money`, `/body`, `/progress` (tabs), `/body/workout`, `/progress/card`, `/coach`, `/vices`, `/vices/[id]`, `/reminders`, `/settings`, `/settings/{checklist,schedule,workouts,challenge,reminders}`, `/settings/challenge/new`, and the three placeholders `/boards` (back to `/today`), `/meals` (back to `/body`) and `/focus` (back to `/schedule`). Every sub-screen passes `back`. `/today?date=YYYY-MM-DD` opens Today on that day. `/progress?challenge=<id>` opens a past challenge.

Navigation is already built for the three placeholders: the More sheet on Today, a row each in Settings, the Meals icon in Body's header and the Focus icon in Schedule's. Fill the page in, keep its `PageHeader` and `back`, and add sub-routes under it as needed.

Dev only, 404 in a production build: `/dev/ui`, `/dev/coach`.

### Today

Today is the home screen and has to answer three questions at a glance: what now, what is left today, am I on track. The header reads `Day X of N` while a challenge runs and a plain date with the consistency line ("26 of the last 30 days locked in") otherwise. When a challenge's last day has passed, a card offers to close it, and closing it plays the finish moment. Its order, top to bottom: day and percent ring, the day strip (the challenge's days, or the last two weeks), one setup row at most (`SetupRow`: add to Home Screen, then turn on reminders, each dismissible and remembered), the morning brief (open on the first visit of the day, then closed for the day once closed), Now and Next with the conflict banner under it, the checklist, this week, the workout.

Features plug into the checklist rows instead of adding cards: the Earned row is `EarnedAction` from `features/money/TodaySlot`, a vice with a slip renders `SlipRow`, `Log a slip` sits under the checklist, and `Log sets` sits in the workout section header. Before adding anything to Today, look for a row it belongs in.

`LocalScheduler` (reminders while the app is open) is mounted once in `AppShell`, so it runs on every screen.

The reminder rows (on/off, time, minutes before) and quiet hours are editable at `/settings/reminders`. `/reminders` (Settings, Notifications) is for the push permission and connection state. `public/sw.js` shows a notification for a push with a JSON payload `{ title, body, url, tag }` and opens `url` on tap.

### Checks

- `npx vitest run src/lib/logic/<yours>.test.ts`
- `npx tsc --noEmit`
- `npx eslint .`
- `npm run build`, then `scripts/serve.sh start 3210` and `npm run e2e -- http://localhost:3210`. The walkthrough runs against the production build with an empty `.env`, at 390 x 844, covers every screen and the cross-feature flows, and fails on any console error. Keep it passing and extend it when you add a flow. `scripts/serve.sh stop` ends the server. It also upgrades a version 1 device store, ends, starts, restarts and finishes a challenge while comparing the history tables byte for byte, walks ongoing mode, and measures the contrast of every piece of text on Today, Progress and Settings in both base themes and under a light palette.
