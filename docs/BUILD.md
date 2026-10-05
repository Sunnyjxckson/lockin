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
- AI: each feature owns its route: `src/app/api/coach` (brief and review wording), `src/app/api/body/meal-estimate` (meal photo), `src/app/api/money/read` (earnings screenshot), `src/app/api/meals/request` (a plain words request to the meal planner, which falls back to its own rules). All of them take the model id, the client and the fallback response from `src/lib/ai/server.ts`. With no `ANTHROPIC_API_KEY` they answer 200 `{ source: "fallback", reason: "no_key" }` (the coach route adds the rule-based `body`), never an error screen.
- Instacart: `src/app/api/meals/instacart` needs `INSTACART_API_KEY` (and `INSTACART_API_URL` for a development key). Without it `GET` answers `{ connected: false }`, the grocery list offers copy and share, and store prices stay estimates either way.
- Boards: `src/app/api/boards/image` fetches a web image for a board on the server (the browser cannot read another site's image). It needs no key and refuses private addresses.
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
- The three areas built last (boards, meals, focus), now merged:
  - boards: `src/app/(app)/boards/**`, `src/features/boards/**`, `src/lib/logic/boards*.ts`, `src/app/api/boards/**`. Mood boards (PRD 14) and the UI that turns a board's palette into the theme (PRD 15). Tables `board`, `board_item`. `mood_log` and `motivation` are in the schema and nothing reads or writes them yet. It calls the theme API, it does not edit `src/lib/theme` or `src/lib/logic/theme.ts`
  - meals: `src/app/(app)/meals/**`, `src/features/meals/**`, `src/lib/logic/meals*.ts`, `src/app/api/meals/**`. Meal planning on a budget (PRD 16). Tables `recipe`, `meal_plan`, `grocery_item`, `pantry_item`, `receipt_price`, `expense`, and the food fields on `app_settings`
  - focus: `src/app/(app)/focus/**`, `src/features/focus/**`, `src/lib/logic/focus*.ts`, `src/app/api/focus/**`. Study and focus timer (PRD 18). Table `focus_session`, `app_settings.focus_goal_minutes` and `app_settings.business_goal`
- Shared files these three do not touch: everything the foundation owns, plus `src/lib/nav.ts`, `src/lib/theme/*`, `src/lib/logic/{challenge,ongoing,theme}.ts`, `supabase/migrations/*`, `scripts/e2e.mjs`, the docs, and the other features' folders
- Need a new dependency, table column, or shared UI component? Feature agents may add a NEW file (a new migration `supabase/migrations/00NN_<what>.sql`, numbered one above the highest file there with no gaps, which `schema.test.ts` checks, a new component under `src/features/<feature>/`). They do not edit shared files. If a shared file truly must change, make the smallest additive edit and list it in your final report.
- Do not run `npm install` for new packages while other agents are working unless you need to. If you do, use `npm install <pkg>` once and report it.
- Do not run `next build` while other agents are editing (it will fail on their half-written files). Use `npx tsc --noEmit` filtered to your files, and `npx vitest run <your tests>`.

## Design

- The look and every rule for building a screen in it are in "Design system" at the end of this file. Read that before touching a screen.
- A theme is data: a base ("Aubergine", the default, or "High contrast") plus an optional palette, written to CSS variables on the root element. Use the tokens, never a hex color, `white` or `black`: a palette can make the page light.
- Mobile first at 390px wide. A floating tab bar: Today, Schedule, Money, Body, Progress. Coach and Vices have icons in Today's top bar. The round mark beside them (the More button) opens Focus, Meals, Boards and Settings. Meals also opens from Body's header and Focus from Schedule's.
- Tap targets 44px minimum. Fewer words, more numbers. Short labels.
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
| `checklist_item` | `ChecklistItem` | `key, name, type ("yesno" / "number" / "text"), cadence ("daily" / "weekly"), target, category ("habit" / "vice"), mode ("quit" / "cap" / null), unit, hint, sort_order, active, archived, weekly_day, with_photo, tracks_money, typical_spend, spend_period ("day" / "week" / null), track ("body" / "money" / "mind" / "clean" / null)`. `track` null (or missing on an old row) means the default: read it with `trackOf(item)` from `logic/tracks`. The last two are the typical spend of a money vice, read with `spendOf(item)` from `logic/vices` |
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
| `coach_note` | `CoachNote` | `date, kind ("morning" / "weekly" / "flag"), body, source ("ai" / "fallback"), basis`. `basis` is set on morning briefs only: the challenge, money target and floor it was written from (`briefBasis` in `logic/coach`). When that differs later the same day, the brief is written again |
| `push_subscription` | `PushSubscriptionRow` | `endpoint, p256dh, auth, user_agent`. Server only in Supabase mode |
| `calendar_token` | `CalendarToken` | `provider, access_token, refresh_token, expires_at, calendar_id, sync_token`. Server only in Supabase mode |
| `reminder_sent` | `ReminderSent` | `date, key`. One row per reminder the scheduled job sent, unique on `key`. Server only |
| `reminder_run` | `ReminderRun` | `last_run_at`. One row, id `"cron"`. Server only |
| `login_attempt` | `LoginAttempt` | `failures, locked_until`. One row, id `"passcode"`. Server only |
| `app_settings` | `AppSettings` | One row, id `"app"`. `seeded, timezone, quiet_start, quiet_end, carbs_target, fat_target, weight_unit, haptics, history_start, daily_floor, weekly_food_budget, food_likes: string[], food_dislikes: string[], focus_goal_minutes, business_goal, preferred_store, display_name`. `display_name` is the name Today greets (Settings, You). `history_start` is the first date of the ongoing history. `daily_floor` is the saved earnings floor (change it with `setDailyFloor`). The floor in force is `useMode().floor`: a running challenge that holds "Earned today" to its own minimum sets it while it runs (`floorOn` in `logic/challenge`) |
| `mood_log` | `MoodLog` | `date, time, mood (1 to 5), note` |
| `motivation` | `Motivation` | `kind ("quote" / "clip" / "why"), body, url, sort_order` |
| `board` | `Board` | `name, kind ("body" / "brand" / "life"), cover_item_id, sort_order` |
| `board_item` | `BoardItem` | `board_id, kind ("image" / "color" / "note"), image_url, note, color, palette: string[] or null, source ("camera" / "web" / "screenshot" / "upload"), source_url, aspect, sort_order`. `image_url` is a storage reference. `palette` is the colors pulled from the image. `aspect` is its width over height, saved when it is added so the collage does not jump |
| `theme` | `ThemeRow` | `name, base ("dark" / "contrast"), palette: { background?, surface?, text?, muted?, accent? } or null, accent, board_id, active`. One active row. Do not write it by hand, use `@/lib/theme` |
| `recipe` | `Recipe` | `name, slot ("breakfast" / "lunch" / "dinner" / "snack"), ingredients: { name, quantity, unit, est_cost, category }[], steps: string[], servings, calories, protein, carbs, fat, est_cost, tags: string[], photo_url, source ("seed" / "user" / "ai")`. Macros and cost are for one serving. The built in library (`logic/mealsLibrary`) is written to the table on the first visit to Meals |
| `meal_plan` | `MealPlan` | `week_start (a Monday, unique), budget, recipe_ids: string[], meals: { date, slot, recipe_id, servings, logged? }[], total_cost, store`. `logged` is the id of the `meal` row written when that meal was cooked |
| `grocery_item` | `GroceryItem` | `plan_id, name, quantity, unit, category, store, price, prices: { [store]: number } or null, bought`. `GROCERY_STORES` in `@/lib/types` lists the five stores |
| `pantry_item` | `PantryItem` | `name` (a food key, unique). What is already at home: left off the grocery list and out of its total. Seeded with the staples (salt, oil, spices) |
| `receipt_price` | `ReceiptPrice` | `name, store, price`, unique on `(name, store)`. What a pack really cost, typed in from a receipt. It replaces the estimate at that store |
| `expense` | `Expense` | `date, amount, category ("groceries"), note, store, plan_id`. The link between groceries and Money: write one row when a week's list is bought and Money shows "Groceries this week" |
| `focus_session` | `FocusSession` | `date, start, end (null while the timer runs), minutes, label, source ("timer" / "manual"), block_id, away_count, away_minutes, clock_minutes, planned_minutes, completed, live`. `minutes` is focused time: clock time minus pauses and time away. `live` is the running timer's state (`{ started_at, planned_seconds, pauses, aways, rev }`), null once finished, so the same clock shows on another device. The coach reads the last two weeks of these |

`Target` is one of `{ kind: "check" }`, `{ kind: "check_by", by }`, `{ kind: "min", min }`, `{ kind: "max", max }`, `{ kind: "range", min, max }`, `{ kind: "text" }`.

Seeded item keys, for `getItemByKey`: `wake, workout, core, calories, protein, earned, study, business, bed, talk, weighin`, and the vices `vice_smoking, vice_drinking, vice_masturbation` (on) plus `vice_vaping, vice_weed, vice_gambling, vice_porn, vice_junk_food, vice_fast_food, vice_energy_drinks, vice_doomscrolling, vice_impulse_spending` (off, `active: false`). Vices are checklist items with `category: "vice"`. Carbs and fat targets are `app_settings.carbs_target` and `fat_target`. Calories and protein targets are the `calories` and `protein` items.

Need a new column or table? Add the next numbered file in `supabase/migrations/` (they run in order: `0001_init`, `0002_reminders`, `0003_vice_spend`, `0004_slip_count`, `0005_money_target_start`, `0006_login_attempt`, `0007_challenges`, `0008_boards_meals_focus`, `0009_focus_fields`, `0010_board_item_aspect`, `0011_meal_pantry_prices`, `0012_coach_note_basis`, `0013_tracks_and_name`). Use plain `create table name (` and `alter table name add column col type` so `schema.test.ts` can read it. A new table or column also needs its entry in `Tables`, `TABLE_NAMES` and `COLUMNS` (`src/lib/db/schema.ts`), and a server only table goes in `SERVER_ONLY_TABLES`. Rows already on a device have no migration: add a step to `src/lib/db/upgrade.ts`, which runs on every load in local mode and is tested in `upgrade.test.ts` against a version 1 store. `adoptDevicePrefs` in the same file runs in every mode and moves what an earlier build kept per device (focus session numbers, the business goal, board image shapes) into the tables.

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
- `upsert` conflict columns need a unique index in Supabase. These exist: `day_log (date, item_id)`, `target_version (item_id, effective_from)`, `body_log (date)`, `workout (weekday, slot)`, `set_log (date, exercise, set_number)`, `push_subscription (endpoint)`, `calendar_token (provider)`, `reminder_sent (key)`, `meal_plan (week_start)`, `pantry_item (name)`, `receipt_price (name, store)`, and `id` on every table. For any other pair, add a unique index in your migration.
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
// mode.challenges    every challenge      mode.today, mode.loading
// mode.floor         the earnings floor in force today      mode.baseFloor   the one saved in settings
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
- `app_settings.daily_floor` and the `earned` item's target are the same number, and `challenge.daily_floor` follows while one is active. Change it with `setDailyFloor` only. Read the floor from `useMode().floor`, which is that number unless the running challenge has its own target for "Earned today". Outside React: `floorOn(settings.daily_floor, runningChallenge, earnedItem.id)`. Money, the coach, the 8:00 pm nudge and the reminder job all use it.
- Focus: reaching `focus_goal_minutes` in a day, or finishing a countdown started from a study block, ticks the `study` item (`syncStudy` in `features/focus/store`). It only unticks a tick it made itself.
- Meals: "Cooked, log it" writes the meal through Body's `addMeal`, so calories and protein reach the checklist the same way. Recording a shop writes one `expense` row.
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
formatDateFull(date)     // "Monday, October 5"
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

`tracks` (Today's four tracks, the greeting, short wording for tiles):

```ts
TRACKS   TRACK_LABEL   trackOf(item)   defaultTrack(item)   orderByTrack(rows)
summarizeTracks(daySummary.items, streaks): { track, label, done, total, value, progress, attention }[]
greeting(hour)   greetingLines(hour, name)      // ["Good morning,", "Sunny."]
shortName(item)   shortHint(item)   shortTarget(target, unit)   // "Study", "Block done", "180g or more"
```

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

A theme is a base plus an optional palette. `logic/theme` (pure, tested) turns any palette into a full theme: solid tokens plus `fx`, the strengths of the three lights, the glass and the tab bar. It holds every pair the app draws to WCAG AA (4.5 to 1, and 7 to 1 on the high contrast base), measured on the page under each light, on glass over each, on the tab bar with a button under it and across the gradient. A color that fails moves along its own lightness, and a light that would wash text out is turned down. `lib/theme` (client) puts the result on the root element as CSS variables, saves it in the `theme` table and keeps a copy on the device, which an inline script in the root layout applies before first paint.

```ts
import { setThemeFromPalette, resetTheme, setBaseTheme, previewTheme, useTheme, getTheme } from "@/lib/theme";

setThemeFromPalette(palette, { boardId?, name?, base? }): Promise<Theme>   // save it and paint it
resetTheme(): Promise<Theme>                  // drop the palette, keep the base
setBaseTheme("dark" | "contrast"): Promise<Theme>
previewTheme(palette | null, base?): Theme    // paint without saving. null goes back to the saved theme
useTheme()   // { base, palette, boardId, name, theme, previewing, setBase, setFromPalette, reset, preview }
getTheme()   // the same state outside React

// palette: { background?, surface?, text?, muted?, accent? }, each "#rrggbb". Leave any out and the base supplies it.
// theme.tokens: bg, surface, surface-2, surface-3, line, line-strong, ink, ink-2, ink-3, accent, accent-2, accent-ink, accent-ink-2, danger, warn, glow-1, glow-2, glow-3
// theme.fx: { glow: [a, b, c], glassHi, glassLo, glassSmoke, glassLine, tile, tileLine, hair, bar }, each 0 to 1
// theme.scheme: "dark" | "light"      theme.adjusted: the tokens that were moved to stay readable
```

From `@/lib/logic/theme`, for a palette picker that wants to show the result before applying it: `buildTheme(base, palette)`, `auditTheme(theme)`, `contrast(a, b)`, `ensureContrast(fg, backgrounds, min)`, `normalizeHex`, `cleanPalette`, `mix`, `luminance`, `BASE_THEMES`, and the grounds the audit measures on: `pageGrounds`, `glassGrounds`, `barGrounds`, `accentGrounds`. `glowsFor(accent)` and `accentPairFor(accent)` are how a palette's accent becomes the three lights and the far end of the gradient. `ThemePicker` in `@/components/app/ThemePicker` is the base picker Settings uses, and can be mounted elsewhere.

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

`prefs` is for things like a dismissed prompt. App data still goes through `db`. What is in prefs today: dismissed setup rows, the closed morning brief, the focus timer's strict mode, grace period, full screen switch, blocker walk through done, strict mode notice, the days Focus ticked Study by itself, a copy of the running timer's state (the row is the shared copy), and per week the meal planner's shuffle seed, last message and last request.

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

Every component, its props, the tokens and the layout rules are in "Design system" at the end of this file. `/dev/ui` shows them all.

Haptics: `import { haptics } from "@/lib/haptics"`, then `haptics.tap()`, `haptics.done()`, `haptics.celebrate()`, `haptics.error()`. `Checkbox`, `Toggle` and `SegmentedControl` already call it.

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

Routes that exist: `/today`, `/schedule`, `/money`, `/body`, `/progress` (tabs), `/body/workout`, `/progress/card`, `/coach`, `/vices`, `/vices/[id]`, `/reminders`, `/settings`, `/settings/{checklist,schedule,workouts,challenge,reminders}`, `/settings/challenge/new`, `/boards` and `/boards/[id]` (back to `/today` and `/boards`), `/meals`, `/meals/grocery` and `/meals/recipes` (back to `/body` and `/meals`), `/focus` and `/focus/business` (back to `/schedule` and `/focus`). API routes: `/api/auth/{login,logout,status}`, `/api/db`, `/api/storage`, `/api/coach`, `/api/body/meal-estimate`, `/api/money/read`, `/api/calendar/*`, `/api/reminders/*`, `/api/boards/image`, `/api/meals/request`, `/api/meals/instacart`. Every sub-screen passes `back`. `/today?date=YYYY-MM-DD` opens Today on that day. `/progress?challenge=<id>` opens a past challenge.

Ways in to Boards, Meals and Focus: the More sheet on Today, a row each in Settings, the Meals icon in Body's header, the Focus icon in Schedule's and the timer button on Today's study row.

Dev only, 404 in a production build: `/dev/ui`, `/dev/coach`.

### Today

Today is the home screen and has to answer three questions at a glance: what now, what is left today, am I on track. Top to bottom:

1. The top bar: "Lock In", then Coach, Vices and the round gradient mark, which is the More button.
2. The greeting by time of day with the name from settings ("Good morning, Sunny."). Under it the date line: the date and `Day X of N` while a challenge runs, or the date and the consistency line ("26 of the last 30 days locked in") otherwise. The date line is a button: it unfolds the day strip (the challenge's days, or the last two weeks). On any day other than today the heading is that date and the strip stays open.
3. At most one notice: a challenge waiting to be closed, one about to start, "Locked", or "Open until" with the way back to today.
4. The morning brief (open on the first visit of the day, then closed for the day once closed). Open, it shows the first paragraph and "Read the rest", which goes to the coach.
5. Now and Next on the glass card, with the schedule conflict banner under it.
6. The four tracks (Body, Money, Mind, Clean), from `summarizeTracks`. Each is a button that filters the tiles to its own.
7. The checklist as tiles, three across, ordered by track (`orderByTrack`), with the count and a hairline for the whole day. `Log a slip` sits under the grid.
8. This week: the weekly items, as tiles.
9. One setup row at most (`SetupRow`), the workout with `Log sets`, and last the board row (`BoardEntry`).

One tile per item, picked in `today/ChecklistTiles.tsx`: a tick (`CheckTile`), a number typed into the tile (`NumberEntryTile`), a number that comes from meals and links to Body (`LinkedNumberTile`), text then a tick in a sheet (`TextTile`), a vice with a slip (`SlipTile`, opens the vice). The Earned tile is `EarnedAction` from `features/money/TodaySlot` and opens quick add. The Study tile carries `FocusAction` from `features/focus/TodaySlot` in its corner: a timer icon, or the running clock. Before adding anything to Today, look for a tile or a slot it belongs in.

Which track an item counts toward is `trackOf(item)`: its own `track` when set (Settings, Checklist, "Track on Today"), otherwise the default in `logic/tracks`.

`LocalScheduler` (reminders while the app is open) and `FocusWatcher` (notices the app being left while a focus timer runs, and keeps the device's copy of the timer in step with its row) are each mounted once in `AppShell`, so they run on every screen.

The reminder rows (on/off, time, minutes before) and quiet hours are editable at `/settings/reminders`. `/reminders` (Settings, Notifications) is for the push permission and connection state. `public/sw.js` shows a notification for a push with a JSON payload `{ title, body, url, tag }` and opens `url` on tap.

### Checks

- `npx vitest run src/lib/logic/<yours>.test.ts`
- `npx tsc --noEmit`
- `npx eslint .`
- `npm run build`, then `scripts/serve.sh start 3210` and `npm run e2e -- http://localhost:3210`. The walkthrough runs against the production build with an empty `.env`, at 390 x 844, covers every screen and the cross-feature flows, and fails on any console error. Keep it passing and extend it when you add a flow. `scripts/serve.sh stop` ends the server. It also upgrades a version 1 device store, ends, starts, restarts and finishes a challenge while comparing the history tables byte for byte, walks ongoing mode, and measures the contrast of every piece of text on Today, Progress and Settings in both base themes and under a light palette. `scripts/e2e-features.mjs` is the second half, run by the same command (or alone with `--features`): a week of meals built, swapped, re-portioned, shopped and cooked through to Money and Today, the focus timer started, paused, reloaded, finished, logged by hand, left and left overnight, a board made and worn as the theme with contrast measured on the new screens in all three looks, and the challenge floor and the morning brief following a challenge change. Screenshots are `.shots/final2-*.png`. The contrast measure knows the look: it takes the page plain and at the brightest point of each light, blends see-through fills down to it, and measures a gradient at every color stop.
- `node scripts/look.mjs http://localhost:3000 /body /progress` screenshots the paths you name in the default look, high contrast and under a dark and a light board palette, to `.shots/redesign-*.png`. With no paths it walks Today and Money through every state. Look at the pictures.

## Design system

The look the owner approved: something for every day that still feels luxurious, not a fitness app. A near black aubergine page with three soft lights behind it (plum, amber, indigo), frosted glass cards with hairline borders, cream text, and one gradient, champagne to rose, that means done or primary and nothing else. Fewer words, more numbers, generous space. One typeface, Schibsted Grotesk. No serif anywhere.

See it: `/dev/ui` in the dev server shows every component. `docs/design/mockup.html` is the approved layout for Today and Money (its typeface is not approved). `src/app/(app)/today` and `src/app/(app)/money` are the two finished screens to copy from. `node scripts/look.mjs <url> /your/path` screenshots your screen in all four looks.

### Tokens

Colors come from the theme at runtime (`logic/theme`), so a board palette re-themes everything and contrast is guaranteed. Use the Tailwind names. Never write a hex color, `white`, `black` or `rgba()` in a component: a palette can make the page light, and `theme.test.ts` fails on a color outside the token block of `globals.css`.

| Tailwind | Use |
| --- | --- |
| `bg-bg` | The page. Rarely needed: the body paints it, with the lights over it |
| `glass` (utility) | A card. A little white, more at the top left, hairline border |
| `tile` (utility) | A resting tile, a text control, a quiet row or notice |
| `grad` (utility) | The gradient fill: done, or the one primary action. Sets its own text color |
| `grad-line` (utility) | The gradient as a progress line or a dot |
| `frost` (utility) | Real backdrop blur. Only the tab bar uses it. Ask before adding another |
| `lit` (utility) | The page color with the three lights, for a fixed layer that covers the whole screen. `Overlay` uses it. Never on anything smaller than the viewport |
| `bg-surface`, `bg-surface-2`, `bg-surface-3` | Solid surfaces: a sheet, a card inside a sheet, a native control. Not for cards on the page |
| `text-ink` | Main text, numbers, headings |
| `text-ink-2` | Secondary text, labels, icons |
| `text-ink-3` | The faintest text that still passes: chevrons, placeholders. Prefer `ink-2` |
| `text-accent` | The accent as text or a thin line: the "NOW" label, a dollar sign, a met target. Sparingly |
| `text-accent-ink`, `text-accent-ink-2` | Text on `grad`: the main line and the second line |
| `bg-ink` with `text-bg` | A selected control: the current tab, a chosen segment, a switch that is on |
| `border-glass-line`, `border-tile-line` | Hairline borders (the utilities set them) |
| `bg-hair`, `divide-hair`, `border-hair` | Hairlines: dividers between rows, the unfilled part of a progress line |
| `border-line`, `border-line-strong` | Solid lines, for solid surfaces |
| `text-warn`, `bg-warn-soft`, `border-warn-line` | Logged but it does not count: a slip, a late check, over a limit |
| `text-danger`, `bg-danger-soft` | Destructive actions and errors |
| `bg-scrim`, `text-on-scrim` | What dims the page behind a sheet or over a photo, and text on it |
| `shadow-glow` | The soft rose glow under anything `grad` |
| `shadow-float` | Things that float: the tab bar, a sheet, a toast |

Text on `bg-ink` is `text-bg`. Text on `grad` is `text-accent-ink`. Anything drawn in inline SVG or on a canvas reads `var(--token)`: `--accent`, `--accent-2`, `--hair`, `--ink`. The lights are `--glow-1` to `--glow-3` and are drawn once, behind everything, by the body. Do not draw more. The one exception is a layer that hides the page: it carries `lit`, which is the same three gradients over the page color (`--lights`), so a full screen view does not fall back to a flat panel.

The pairs that are guaranteed readable, in every theme and under every palette: `ink`, `ink-2`, `ink-3`, `accent`, `warn` and `danger` as text on the page, on `glass`, on `tile` and on the solid surfaces. `warn` on `warn-soft`, `danger` on `danger-soft`, `accent` on `accent-soft`. `accent-ink` and `accent-ink-2` on `grad`. `bg` on `ink`. Nothing else is. So never fade text with an opacity or a `/70` color, never put `ink-2` on `grad` or on `ink`, and never put text on `bg-accent` or `bg-warn` other than `accent-ink`.

Shape, space and motion, as CSS variables and the classes to reach for:

| What | Value | Class |
| --- | --- | --- |
| Page side padding | 20px (`--page-x`), column up to 480px | `Screen` does it |
| Text set straight on the page | 4px further in than cards | `px-1` |
| Between sections | 28px (`--gap-section`) | `mt-7`, or `Section` |
| Between cards in a stack | 12px (`--gap-card`) | `gap-3`, `mt-3` |
| Between tiles | 10px (`--gap-tile`) | `gap-2.5` |
| Between stats in a row | 14px | `gap-3.5` |
| Label to its content | 12px | `mt-3` |
| Radius: feature card | 26px (`--radius-xl`) | `GlassCard` |
| Radius: card, sheet top | 24px, 30px | `Card`, `Sheet` |
| Radius: tile, notice, quiet row | 20px (`--radius-lg`) | `rounded-[20px]` |
| Radius: text control | 16px (`--radius`) | the fields do it |
| Radius: buttons, segments, the tab bar, chips | full | `rounded-full` |
| Elevation | hairline only, `shadow-glow` under `grad`, `shadow-float` for what floats | |
| Tab bar | `--tabbar-h` is all the room it takes, `--safe-b`, `--safe-t` | `Screen` leaves the room |
| Motion | `--dur-fast` 120ms, `--dur` 220ms, `--dur-slow` 420ms, `--ease-out` | `pressable`, `animate-fade-in`, `animate-rise-in` |

Anything fixed to the bottom of the screen sits at `bottom-[calc(var(--tabbar-h)+var(--safe-b))]`. Other animations: `animate-sheet-up`, `animate-toast-in`, `animate-check-pop`, `animate-shake`, `animate-pulse-dot`, and `animate-day-ring`, `animate-day-check`, `animate-day-text` for the full day moment. All motion is switched off under `prefers-reduced-motion`.

### Type

One family. Medium (500) with tight tracking for headlines, numbers and tile values. Regular (400) for body. Small uppercase tracked labels. Never bold: no `font-semibold`, no `font-bold`. Buttons and the selected tab are `font-medium`.

| Class | Size | For |
| --- | --- | --- |
| `t-hero` | 84 | The one big number a screen leads with. Use `BigNumber` |
| `t-display` | 64 | A big number in a moment or a sheet |
| `t-greeting` | 38 | The greeting, or a tab screen's opening line |
| `t-num` | 40 | A large stat |
| `t-title` | 28 | Page titles. `PageHeader` does it |
| `t-num-sm` | 28 | An inline stat |
| `t-h1` | 26 | The title inside a glass card |
| `t-stat` | 22 | A number in a row of stats. `TrackStat` does it |
| `t-h2` | 20 | Card and sheet headings |
| `t-value` | 20 | Tile values, the amount at the end of a row |
| none | 16 or 15 | Body. Regular |
| `t-sub` | 13 | Secondary lines. Sets `ink-2` |
| `t-caption` | 12 | Tile labels, the line under a row title. Add `text-ink-2` |
| `t-label` | 11 | Uppercase tracked labels. Sets `ink-2`. `SectionLabel` does it |

Numbers use the face's own figures everywhere. `tnum` is still in the code and now does nothing. `tabular` gives fixed width figures and is only for a clock that is counting, where the digits would otherwise jump.

### Components

All from `@/components/ui`. Icons from `lucide-react` at size 18 to 22 with `strokeWidth={1.75}`.

| Component | Props | Use |
| --- | --- | --- |
| `Screen` | `children, className?` | Wrap every page in it. Column, side padding, safe area, room for the tab bar |
| `TopBar` | `title, right?, as? ("h1" / "p")` | Top row of a tab screen that leads with a hero: name small on the left, a status or icons on the right |
| `PageHeader` | `title, eyebrow?, subtitle?, back? (href), onBack?, backLabel?, right?` | Top of a screen that leads with its name. Every sub-screen passes `back`. A view that is a state of its screen and has no address passes `onBack` |
| `GlassCard` | `pad? ("lg" / "md" / false), frost?`, plus div props | The one or two feature cards a screen leads with |
| `Card` | `padded? = true, raised?`, plus div props | Every other card. `raised` is solid, for inside a card or sheet. `padded={false}` with `overflow-hidden` for rows |
| `Section` | `title, right?, children` | A labeled group with the standard gap above |
| `SectionLabel` | `children, right?, as?` | The small uppercase line that opens a group: "TODAY   7 OF 12" |
| `Tile` | `value, label?, state? ("off" / "done" / "attention"), onClick? / href? / htmlFor?, checked?, disabled?, corner?, aria-label?` | A tap tile. Pass `checked` to make it a checkbox. `corner` holds a second small action with its own tap target |
| `NumberTile` | `value, onChange, name, label?, unit?, prefix?, state?, disabled?, decimal?` | A tile a number is typed straight into |
| `TrackStat` | `value, label, unit?, progress?, attention?, caption?, captionTone? ("quiet" / "done" / "warn"), onClick?, pressed?` | One of a row of two to four stats, with a hairline that fills. Leave `progress` out for no line. `caption` is a short line under the hairline ("60g left") |
| `BigNumber` | `value, prefix?, unit?, label?, sub?, size? ("hero" / "display")` | The hero number, set as one line of text. `prefix="$"` is drawn small and raised in the accent, `unit` small on the baseline. Pass the amount without its sign: `prefix="$" value="52.30"` |
| `ClockText` | `text, className?` | A clock that is counting ("19:38"): fixed width digits, colons at their natural width |
| `Stat` | `label, value, unit?, sub?, size? ("display" / "lg" / "sm"), done?, align?` | A number with its label above, inside a card |
| `List` | `children, label?` | Rows divided by hairlines, straight on the page, no card |
| `ListRow` | `title, sub?, left?, right?, value?, href?, onClick?, plain?` | A row. `value` is a large number at the right end. Tappable rows get a chevron unless they have a `value` |
| `Button` | `variant? ("primary" / "solid" / "secondary" / "ghost" / "danger"), size? ("sm" / "md" / "lg"), full?, loading?, icon?` | `primary` is the gradient: one per screen or sheet. `secondary` is glass and is the everyday button. `solid` is cream |
| `ButtonLink` | `href, variant?, size?, full?, icon?, iconAfter?` | The same button as a link, for a main action that goes to another screen. Do not hand-build a `grad` link |
| `ActionButton` | `label, size? = 52` | The round gradient button holding one icon: the main action of a card. One per view |
| `IconButton` | `label, filled?` | 44px round icon button. `filled` puts glass behind it |
| `IconLink` | `href, label, filled?` | The same as a link, for a header |
| `Sheet` | `open, onClose, title?, subtitle?, footer?, children` | Bottom sheet, solid. Stays above the keyboard. Load sheet components with `next/dynamic` and render them only while open |
| `NumberField` | `value, onChange, live?, label?, hint?, unit?, prefix?, min?, max?, decimal?, variant? ("field" / "inline" / "hero" / "bare"), done?, disabled?` | `onChange` fires on blur or Enter. `hero` for the amount in a quick add sheet |
| `TextField` | `value, onChange, onCommit?, label?, hint?, error?, placeholder?, rows?, maxLength?` | |
| `TimeField`, `DateField` | `value, onChange, label?, hint?` (`min?, max?` on date) | Native pickers |
| `Select` | `value, onChange, options, label?, hint?` | Native picker with a chevron |
| `Field` | `label, hint?, error?, htmlFor?` | Label wrapper for a custom control |
| `SegmentedControl` | `options, value, onChange, label?, size? ("sm" / "md")` | Two to seven even choices. The chosen one is a cream pill. `sm` draws 36px tall and still takes taps over 44px |
| `Chip` | `on, onClick, icon?, disabled?` | One choice as a 44px pill, in a `flex flex-wrap gap-2` row, where the choices are too many or too uneven for segments. Pick one or pick several: the parent holds what is on. Chosen is cream |
| `Toggle` | `checked, onChange, label?` | On is cream, not the gradient |
| `Checkbox`, `CheckMark` | `checked, onChange, label, off?, size?` | The round tick, gradient when done. For rows. On a grid use `Tile` |
| `PillCheck` | `checked, onChange, children, disabled?, aria-label?` | A checkbox as a pill with words on it ("Clean today"): a tile with an empty ring, the gradient with a tick when done |
| `ProgressBar` | `value, height? = 3, tone? ("accent" / "ink" / "warn"), marker?, label?` | A hairline by default. `accent` is the gradient |
| `ProgressRing` | `value, size? = 88, stroke?, tone?, label?, children?` | Thin ring, gradient stroke. For a moment or a summary, not as a screen's header |
| `EmptyState` | `title, body?, icon?, action?, compact?, row?` | Every list and screen has one. `row` is one quiet left aligned tile, for a small group with nothing in it yet |
| `Notice` | `tone? ("quiet" / "warn"), icon?, title?, action?, actions?`, plus div props | One row that needs reading: locked, a conflict, a setup prompt. `action` sits at the right end, `actions` is a row of buttons under the text |
| `Overlay` | `onClose, label, header?, footer?, className?` | A full screen layer over the app, tab bar included, with the page lights (`lit`). `header` and `footer` are pinned and do not scroll |
| `useToast()` | `toast(message, { kind?: "info" / "done" / "error" })` | The provider is mounted |
| `TabBar` | none | Rendered by the app layout. Do not render it. Lit routes are in `src/lib/nav.ts` |

### Layout

- **A tab screen with a hero** (Today, Money): `TopBar`, then the hero with `pt-4` or `pt-5` (a `BigNumber`, a greeting), then a `GlassCard` for what you act on, then a row of `TrackStat`s, then labeled groups. This is the default for Body and Progress too: lead with the one number that matters.
- **A tab screen without one**: `PageHeader title` with its actions in `right`.
- **A sub-screen**: `PageHeader title back="/parent"`, actions in `right` on the back row. Then content.
- **One feature card, maybe two.** Everything else sits straight on the page under a `SectionLabel`, or in a plain `Card`. A screen that is a stack of five cards is the old look.
- **Lists.** Things you log (earnings, meals, sessions, slips): `SectionLabel` then `List` of `ListRow` with the number as `value`, no card. Settings and menus: `Card padded={false} className="overflow-hidden"` around `<div className="divide-y divide-hair">`.
- **Things you tick or enter every day**: a `grid grid-cols-3 gap-2.5` of `Tile`s, not rows with checkboxes.
- **Forms** live in a `Sheet`: fields stacked with `gap-4`, labels from the field's `label`, one `Button` (primary, `full`, `size="lg"`) in `footer`. A destructive second button sits to its left as `variant="danger"`. A hero number at the top of a sheet is `NumberField variant="hero"`.
- **Notices** (locked, a conflict, a setup prompt): `Notice`, with `tone="warn"` when it needs a look. At most one at a time near the top. Do not hand-build a `bg-warn-soft` box.
- **Full screen views** (a board piece, the look studio, the focus view, a finish moment): `Overlay`, or `lit` on your own `fixed inset-0` layer when the element has to be yours (full screen API, a moment that fades). Never `bg-bg` on a full screen layer: that is the flat panel.
- **Tab names.** The tabs read Today, Plan, Money, Body, Record. The routes are still `/schedule` and `/progress`. Say Plan and Record in titles, links and copy that point at those tabs. The weekday template in Settings is "Weekly plan".
- **Charts**: thin. Lines 1.5 to 2px, bars with fully round ends, no grid lines, at most one hairline baseline in `var(--hair)`. The series is `var(--accent)` or the accent to accent-2 gradient, anything secondary is `var(--ink-3)`. Axis labels are `t-caption text-ink-2`. Put the number the chart is about above it in `t-num` or `t-stat`, so the chart supports a number and is not the only way to read it. No chart inside a chart card inside a section: label, number, chart.
- **Calendars and grids of days**: cells are `tile`, a full day is `grad`, a partial day is `tile` with a `bg-ink-3` dot, today is ringed with `border-ink`.
- **Empty states**: `EmptyState` with one short title, one sentence, one action. Inside a group use `compact` in a `Card padded={false}`.
- **Photos**: `rounded-[20px]`, no border. Text over a photo sits on `bg-scrim` with `text-on-scrim`.

### Performance and accessibility

- `glass` does not blur. Behind a card there is only the soft light layer, and blurring a soft gradient changes nothing you can see. Only `frost` blurs, and only the tab bar uses it. Do not add `backdrop-blur` to a card, a list row, or anything that animates or scrolls. Where the browser has no backdrop-filter, `frost` falls back to a solid surface by itself.
- The lights are one fixed layer of plain gradients. Do not add blurred shapes, `filter: blur()`, or animated gradients.
- Every tap target is at least 44px in both directions. A small icon gets a 44px box around it (`IconButton`, `size-11`, `min-h-11`).
- Respect `prefers-reduced-motion`: use the animation utilities and `pressable`, which are switched off under it. Nothing may depend on an animation finishing.
- Contrast is AA (4.5 to 1, 3 to 1 for text of 24px and up) and 7 to 1 on the high contrast base. The walkthrough measures every piece of text on screen, over the lights and on gradients. Add your screen to a `checkContrast` call in `scripts/e2e.mjs` or `scripts/e2e-features.mjs`.

### Do and do not

- Do lead with a number or one line. Do cut a sentence to a label and a number.
- Do use `grad` once per view for the primary action, and for done states. Do not use it for decoration, selection, headers or charts' backgrounds.
- Do use `ink` (cream) for selected: tabs, segments, switches.
- Do not use `bg-surface` cards on the page. That is the flat gray look that was rejected. `glass` or nothing.
- Do not use `font-semibold` or `font-bold`, `tracking-wide` on body text, or all caps outside `t-label`.
- Do not use `border-line` between rows on glass or on the page. Use `divide-hair`.
- Do not stack explanations. One `t-sub` line under a thing at most. If it needs a paragraph, it belongs on another screen or in a sheet.
- Do not use an em dash or en dash, or emoji, anywhere.
- Do not hardcode a color, and do not fade text with opacity.
- Do not render a second tab bar, a second light layer, or a blur.

### This screen is done when

1. It leads with a `TopBar` and a hero, or a `PageHeader`, and sub-screens have `back`.
2. No `bg-surface` card on the page, no `font-semibold`, no `divide-line`, no hex color, no `tnum` added for looks.
3. There is one `grad` primary action at most, and done states are `grad`.
4. Daily tick and entry things are tiles, logged things are a `List`, forms are in sheets.
5. Every tap target is 44px or more, and nothing sits behind the tab bar at the end of the page.
6. It reads with half the words it had.
7. You looked at it at 390 x 844 with `node scripts/look.mjs <url> /path` in the default look, high contrast, the dark palette and the light palette, with real data and empty.
8. `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` and the walkthrough pass, with your screen in a contrast check and no console errors.
