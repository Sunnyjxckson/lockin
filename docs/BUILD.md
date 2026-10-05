# Lock In build conventions

Read docs/PRD.md first. It is the spec. This file is the contract between agents working in this repo at the same time.

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
- AI: server routes under `src/app/api/ai/*`. With no `ANTHROPIC_API_KEY` they return a clearly marked fallback (rule-based coach text; an empty editable form for photo reads) with `{ source: "fallback" }`, never an error screen.
- Calendar and push: with no keys the UI shows a "not connected" state with what to set, and everything else keeps working.
- `.env.example` lists every variable. README.md has the setup steps for each service.

## Rules from the PRD that live in pure functions

Put these in `src/lib/logic/*` with Vitest tests. No React, no db calls inside them.

- Day number comes from start_date, never stored
- The daily floor never drops when the running total is ahead
- Streaks are per item, computed from day_log
- A day can be edited until noon the next day, then it locks
- A day is full when every daily item is done, partial when some are, missed when none are
- Settings changes apply from today forward; past days keep the targets they were scored against (targets are versioned by effective date)
- All dates are local America/New_York calendar dates stored as YYYY-MM-DD strings. Never use toISOString() for a calendar date.

## Ownership (do not edit files outside your area)

- Foundation owns: package.json, config, `src/lib/db`, `src/lib/storage`, `src/lib/logic/{dates,day,streaks,targets}`, `src/lib/types.ts`, `src/lib/seed`, `src/components/ui/*`, `src/app/layout.tsx`, nav, passcode, `src/app/(app)/today`, `src/app/(app)/settings`, `supabase/migrations/0001_init.sql`
- Each feature agent owns `src/app/(app)/<feature>/**`, `src/features/<feature>/**`, `src/lib/logic/<feature>*.ts`, `src/app/api/<feature>/**`
- Need a new dependency, table column, or shared UI component? Feature agents may add a NEW file (a new migration `supabase/migrations/00NN_<feature>.sql`, a new component under `src/features/<feature>/`). They do not edit shared files. If a shared file truly must change, make the smallest additive edit and list it in your final report.
- Do not run `npm install` for new packages while other agents are working unless you need to. If you do, use `npm install <pkg>` once and report it.
- Do not run `next build` while other agents are editing (it will fail on their half-written files). Use `npx tsc --noEmit` filtered to your files, and `npx vitest run <your tests>`.

## Design

- Dark theme only. Near-black background, large numbers, one accent color used only for done states and primary progress. Tokens live in the foundation's CSS variables. Use them, do not invent colors.
- Mobile first at 390px wide. Bottom tab bar: Today, Schedule, Money, Body, Progress. Coach, Vices, and Settings are reached from Today's header.
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

What the foundation gives you. Import from these paths and you should not need to read the source. `/dev/ui` in the running app shows every component.

Also owned by the foundation, beyond the list above: `src/lib/blocks.ts`, `src/lib/auth/*`, `src/lib/haptics.ts`, `src/components/app/*`, `src/app/api/{auth,db,storage}`, `src/app/dev/ui`, `public/sw.js`, `scripts/*`.

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
| `challenge` | `Challenge` | One row, id `"challenge"`. `start_date, length_days, money_target, money_deadline, daily_floor` |
| `checklist_item` | `ChecklistItem` | `key, name, type ("yesno" / "number" / "text"), cadence ("daily" / "weekly"), target, category ("habit" / "vice"), mode ("quit" / "cap" / null), unit, hint, sort_order, active, archived, weekly_day, with_photo, tracks_money` |
| `target_version` | `TargetVersion` | `item_id, effective_from, target, active`. Target history. Do not write it by hand, use the helpers |
| `day_log` | `DayLog` | `date, item_id, value, checked, text, completed_at`. One row per item per day |
| `vice_slip` | `ViceSlip` | `item_id, date, time, trigger, amount` |
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
| `app_settings` | `AppSettings` | One row, id `"app"`. `seeded, timezone, quiet_start, quiet_end, carbs_target, fat_target, weight_unit, haptics` |

`Target` is one of `{ kind: "check" }`, `{ kind: "check_by", by }`, `{ kind: "min", min }`, `{ kind: "max", max }`, `{ kind: "range", min, max }`, `{ kind: "text" }`.

Seeded item keys, for `getItemByKey`: `wake, workout, core, calories, protein, earned, study, business, bed, talk, weighin`, and the vices `vice_smoking, vice_drinking, vice_masturbation` (on) plus `vice_vaping, vice_weed, vice_gambling, vice_porn, vice_junk_food, vice_fast_food, vice_energy_drinks, vice_doomscrolling, vice_impulse_spending` (off, `active: false`). Vices are checklist items with `category: "vice"`. Carbs and fat targets are `app_settings.carbs_target` and `fat_target`. Calories and protein targets are the `calories` and `protein` items.

Need a new column or table? Add `supabase/migrations/00NN_<feature>.sql`. A new table also needs an entry in `Tables`, `TABLE_NAMES` and `COLUMNS` (`src/lib/db/schema.ts`), which are shared files: make the smallest additive edit and report it.

### Data: `@/lib/db`

```ts
import { db, subscribe, notify, isSupabaseMode, type Query } from "@/lib/db";

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
- `upsert` conflict columns need a unique index in Supabase. These exist: `day_log (date, item_id)`, `target_version (item_id, effective_from)`, `body_log (date)`, `workout (weekday, slot)`, `set_log (date, exercise, set_number)`, `push_subscription (endpoint)`, `calendar_token (provider)`, and `id` on every table. For any other pair, add a unique index in your migration.
- Every write notifies subscribers of that table. `subscribe(table, fn)` returns an unsubscribe function. The hooks do this for you.
- Errors are `DbError` with a readable message.

### Hooks: `@/lib/db/hooks`

All return `Loadable<T> = { data, loading, error, reload }` unless noted. They re-read after any write to the tables they depend on. `loading` is true only until the first read. Results are cached, so a screen you return to paints at once.

```ts
useList(table, query?)          // Loadable<Row[]>. query may be an inline object
useRow(table, id)               // Loadable<Row | null>
useQuery(key, tables, read, initial) // Loadable<T>. Any async read, re-run when one of `tables` is written
useChallenge()                  // Loadable<Challenge | null>. The active challenge
useSettings()                   // Loadable<AppSettings | null>
useChecklist()                  // Loadable<{ items: ChecklistItem[]; versions: TargetVersion[] }>
useLogs(from, to?)              // Loadable<DayLog[]>
useDay(date)                    // { summary: DaySummary | null; week: WeekSummary | null; loading }
useWorkouts()                   // Loadable<Workout[]>
useDayBlocks(date)              // Loadable<DayBlock[]>
useToday()                      // DateStr. Today in New York, rolls over at midnight
useNow(everyMs = 30000)         // Date that ticks, and refreshes when the app returns to the front
useInstalledOn()                // DateStr | null. Pass to the lock functions
clearQueryCache()
```

The active challenge and today's date:

```ts
const today = useToday();
const { data: challenge } = useChallenge();
const n = challenge ? dayNumber(challenge.start_date, today) : null;
```

Outside React: `getChallenge()` from `@/lib/db/helpers` and `todayNY()` from `@/lib/logic/dates`.

### Typed helpers: `@/lib/db/helpers`

No React. Usable in API routes in Supabase mode.

```ts
getChallenge(): Promise<Challenge | null>
updateChallenge(patch): Promise<Challenge>
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
logWeight(date, weight | null)                // writes body_log and the weekly weigh-in item

getWorkouts(): Promise<Workout[]>
workoutsFor(all, weekday): { main: Workout | null; core: Workout | null }
resetAllData()
```

Keeping the checklist in step with your feature. Today scores from `day_log` only, so:

- Money: after any earning is added, changed or removed, call `setValueByKey("earned", date, totalForThatDate)`.
- Body: after any meal change, call `setValueByKey("calories", date, total)` and `setValueByKey("protein", date, total)`. Save weight with `logWeight(date, weight)`.
- Vices: turn library vices on with `setItemActive`. A capped vice is `type: "number"`, `mode: "cap"`, target `{ kind: "max", max }`.
- `challenge.daily_floor` and the `earned` item's target are the same number. Settings keeps them in step. If you change one, change the other.

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

`day`:

```ts
type DayStatus = "full" | "partial" | "missed";
type ItemState = "done" | "open" | "off";      // off: logged but does not meet the target
meetsNumber(target, value): boolean
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
itemStreak(item, versions, logs, today, from): { current, best, doneNow }   // from = challenge start
allStreaks(items, versions, logs, today, from): Record<itemId, Streak>
fullDayStreak(statusByDate, today, from): number
```

Daily items count days, weekly items count weeks. Today (or this week) not being done yet does not break a streak.

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
const { data: logs } = useLogs(challenge.start_date, today);
const status = summarizeDay(date, items, versions, logs).status;
const streaks = allStreaks(items.filter((i) => i.active), versions, logs, today, challenge.start_date);
```

Your own rules go in `src/lib/logic/<feature>*.ts` (the floor rule belongs to Money, for example).

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

Server routes and data: in local mode the server has no data (it is in the browser). An API route that needs data must be sent it in the request body. Only in Supabase mode can a route call `db` and the helpers directly. Features that need the server to act alone (scheduled push) need Supabase, and should say so in their not connected state.

### UI: `@/components/ui`

```ts
import { Button, Card, Sheet, ... } from "@/components/ui";
```

Icons come from `lucide-react` (installed), usually at size 18 to 24.

| Component | Props |
| --- | --- |
| `Screen` | `children, className?`. Page container: centered column up to 480px, 20px side padding, room for the tab bar. Wrap every page in it |
| `PageHeader` | `title, eyebrow?, subtitle?, back? (href), right? (node)` |
| `Section` | `title, right?, children`. Uppercase eyebrow then content, with top margin |
| `Card` | `padded? = true, raised? = false`, plus div props. Use `padded={false}` with `overflow-hidden` for lists |
| `ListRow` | `title, sub?, left?, right?, href?, onClick?, plain?`. Stack inside `<Card padded={false}><div className="divide-y divide-line">` |
| `Button` | `variant? ("primary" / "secondary" / "ghost" / "danger"), size? ("sm" / "md" / "lg"), full?, loading?, icon?`, plus button props |
| `IconButton` | `label (required), filled?`, plus button props. 44px round |
| `Sheet` | `open, onClose, title?, subtitle?, footer?, children`. Bottom sheet |
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
| `TabBar` | No props. Already rendered by the app layout, do not render it again |
| `cn(...)` | Joins class names |

Haptics: `import { haptics } from "@/lib/haptics"`, then `haptics.tap()`, `haptics.done()`, `haptics.celebrate()`, `haptics.error()`. `Checkbox`, `Toggle` and `SegmentedControl` already call it.

### Tokens

Defined in `src/app/globals.css`. Use the Tailwind names. Do not write hex colors.

| Tailwind | CSS variable | Use |
| --- | --- | --- |
| `bg-bg` | `--bg` | Page background |
| `bg-surface`, `bg-surface-2`, `bg-surface-3` | `--surface`, `--surface-2`, `--surface-3` | Cards, controls inside cards, tracks |
| `border-line`, `border-line-strong` | `--line`, `--line-strong` | Borders and dividers |
| `text-ink`, `text-ink-2`, `text-ink-3` | `--ink`, `--ink-2`, `--ink-3` | Primary, secondary, faint text |
| `bg-accent`, `text-accent`, `text-accent-ink`, `bg-accent-soft`, `border-accent-line` | `--accent` and friends | Done states and primary progress only |
| `text-danger`, `bg-danger-soft` | `--danger` | Destructive actions and errors |
| `text-warn`, `bg-warn-soft` | `--warn` | Logged but does not count, over a limit |

Buttons, selected segments and switches use ink, not the accent, so the accent always means done.

Type classes: `t-display` (64px hero numeral), `t-num` (40px), `t-num-sm` (28px), `t-title` (28px page title), `t-h2` (20px), `t-sub` (14px secondary), `t-label` (12px uppercase eyebrow), `tnum` (tabular figures). Body text is 16px with no class.

Other utilities: `pressable` (press feedback), `no-scrollbar`, and the animations `animate-fade-in`, `animate-rise-in`, `animate-sheet-up`, `animate-toast-in`, `animate-check-pop`, `animate-shake`, `animate-ring-glow`, `animate-pulse-dot`. All motion is switched off under `prefers-reduced-motion`.

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

Routes that exist: `/today`, `/schedule`, `/money`, `/body`, `/progress` (tabs), `/coach`, `/vices`, `/reminders` (stubs, linked from Today or Settings), `/settings` and `/settings/{checklist,schedule,workouts,challenge,reminders}`. Coach and Vices use `back="/today"`.

The reminder rows (on/off, time, minutes before) and quiet hours are already editable at `/settings/reminders`. `/reminders` is for the push permission and connection state. `public/sw.js` already shows a notification for a push with a JSON payload `{ title, body, url, tag }` and opens `url` on tap.

### Checks

- `npx vitest run src/lib/logic/<yours>.test.ts`
- `npx tsc --noEmit`
- `npm run e2e -- http://localhost:<port>` clicks through the foundation at 390 x 844 and must keep passing. It expects a fresh browser and a seeded app, and it looks for the stub headings (`Schedule`, `Money`, `Body`, `Progress`, `Coach`, `Vices`) as the level 1 heading of each page.
