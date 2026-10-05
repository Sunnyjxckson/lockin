# Lock In

A single-user, mobile-first PWA that runs a 30 day challenge: one checklist, a fixed schedule, money, body, vices, streaks and a coach in one place. The spec is `docs/PRD.md`. The rules for working in this repo are in `docs/BUILD.md`.

## Run it with no keys

Needs Node 22.

```
npm install
npm run dev
```

Open http://localhost:3000 in a phone-sized window. With an empty `.env` the whole app works on one device:

- It asks you to create a 4 digit passcode, then seeds the challenge, checklist, schedule, workouts, reminders and the vice library.
- Today, Schedule, Money, Body, Progress, Vices, Coach and Settings all work. Data is in the browser's localStorage, photos in IndexedDB.
- The coach writes its morning brief, Sunday review and flags from rules instead of Claude, and says so on the note.
- Snapping a meal or an earnings screenshot attaches the photo and opens the form empty for you to type the numbers.
- Reminders show as notifications while the app is open or recently in the background, if you allow notifications. Nothing arrives when the app is closed.
- Google Calendar shows as not connected.

What you do not get without keys: data that survives clearing the browser or follows you to another device, reminders when the app is closed, Claude's writing and photo reading, and calendar sync.

## Deploy: zero to Vercel with Supabase

Do the steps in order. Every environment variable below goes in Vercel under Project, Settings, Environment Variables (and in `.env.local` if you also run it on your machine). `.env.example` lists them all.

### 1. Supabase (database and photos)

1. Create a project at supabase.com.
2. Open the SQL editor and run every file in `supabase/migrations/` in number order, one at a time:
   1. `0001_init.sql` (tables, row level security, the public `photos` bucket)
   2. `0002_reminders.sql` (what the reminder job has sent and when it last ran)
   3. `0003_vice_spend.sql` (typical spend for money vices)
   4. `0004_slip_count.sql` (slip count on each day's log row)
   5. `0005_money_target_start.sql` (start date of the current money target)
   6. `0006_login_attempt.sql` (wrong passcode counter)

   With the Supabase CLI linked to the project, `supabase db push` runs them all in order.
3. From Project settings, API, copy the project URL and the `service_role` key.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | The `service_role` key. Server only, never the anon key |
| `SUPABASE_PHOTO_BUCKET` | `photos` unless you renamed the bucket |
| `LOCKIN_PASSCODE` | 4 to 8 digits. Required once Supabase is on |

The service role key never reaches the browser. The browser calls `/api/db`, which checks the passcode cookie and then talks to Supabase. Row level security is on with no policies, so the public anon key can read nothing. Photos are in a public bucket at random paths: anyone with a photo's full URL can open it, nobody can list them. Wrong passcode tries are counted in the `login_attempt` table: every 5 in a row lock the login, for 1 minute at first and doubling up to an hour.

### 2. Vercel

1. Push this repo to GitHub and import it at vercel.com/new. The defaults are right (Next.js, `npm run build`).
2. Add the variables from step 1 and deploy.
3. Open the deployment, enter the passcode. The first load seeds the database.

Note the production URL, for example `https://lock-in.vercel.app`. The next steps need it.

### 3. Claude (coach, meal photos, earnings screenshots)

Create a key at console.anthropic.com and set it.

| Variable | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | The key |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-sonnet-5-5`. Whatever you set must accept images |

Without the key every AI route answers `{ source: "fallback", reason: "no_key" }` and the app carries on with rule-based text and empty forms.

### 4. Google Calendar (two-way sync)

1. In Google Cloud console, create a project and enable the Google Calendar API.
2. Set up the OAuth consent screen: External, add your own Google account as a test user, add the scope `https://www.googleapis.com/auth/calendar`.
3. Create credentials, OAuth client ID, type Web application.
4. Under Authorized redirect URIs add exactly `https://YOUR-APP.vercel.app/api/calendar/callback` (and `http://localhost:3000/api/calendar/callback` if you run it locally).

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | From the OAuth client |
| `GOOGLE_CLIENT_SECRET` | From the OAuth client |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-APP.vercel.app/api/calendar/callback`, the same string you gave Google |

Redeploy, then open Schedule, scroll to Calendar sync and connect. While the consent screen is in Testing, Google expires the sign in after 7 days. Publish the consent screen to make it stick.

### 5. Reminders (web push)

Push needs Supabase (steps 1 and 2), three VAPID values, a cron secret and something that calls the job every 5 minutes.

1. Make the VAPID pair on your machine:

   ```
   npx web-push generate-vapid-keys
   ```

2. Make a cron secret: any long random string, for example `openssl rand -hex 32`.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | The public key from step 1 |
| `VAPID_PRIVATE_KEY` | The private key from step 1 |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `CRON_SECRET` | The secret from step 2 |

3. Schedule the job. It is `GET /api/reminders/cron` and it must run every 5 minutes. **Vercel's free (Hobby) plan only allows cron jobs that run once a day, and a deploy with a faster schedule fails**, so `vercel.json` ships with no cron. Pick one:
   - **Free plan: an external pinger.** Use cron-job.org, an Upstash QStash schedule, a GitHub Actions schedule, or any uptime pinger. Have it call `https://YOUR-APP.vercel.app/api/reminders/cron` every 5 minutes with the header `Authorization: Bearer YOUR_CRON_SECRET`. If the service cannot send headers, use `https://YOUR-APP.vercel.app/api/reminders/cron?secret=YOUR_CRON_SECRET`.
   - **Paid plan (Pro): Vercel Cron.** Add this to `vercel.json` and redeploy. Vercel sends the `Authorization` header itself when `CRON_SECRET` is set.

     ```json
     {
       "$schema": "https://openapi.vercel.sh/vercel.json",
       "crons": [{ "path": "/api/reminders/cron", "schedule": "*/5 * * * *" }]
     }
     ```

4. Redeploy, then on the phone open Settings, Notifications, and turn notifications on. That screen shows which keys the server has, how many devices are subscribed and when the job last ran. It also has a test button.

The job sends anything that came due since its last run, so a late ping still delivers. Nothing is sent during quiet hours.

### 6. Put it on the iPhone Home Screen

On an iPhone, push only works for an app added to the Home Screen. Do this before turning notifications on.

1. Open the Vercel URL in Safari (not Chrome, not an in-app browser).
2. Tap Share, then Add to Home Screen, then Add.
3. Open Lock In from the new icon, enter the passcode, and turn notifications on in Settings, Notifications.

Today shows a small "Add to Home Screen" row with these steps until you install or dismiss it. On Android and desktop Chrome the same row opens the browser's own install prompt.

## Where data lives

| Setup | Data | Photos | Passcode |
| --- | --- | --- | --- |
| Nothing set | localStorage on the device | IndexedDB on the device | Created on the device, stored as a salted hash |
| `LOCKIN_PASSCODE` set | same | same | Checked on the server, httpOnly cookie for 30 days |
| Supabase set | Supabase, through `/api/db` | Supabase Storage, through `/api/storage` | `LOCKIN_PASSCODE` is required |

Device data does not sync between devices and is lost if the browser's site data is cleared. Data entered in device mode is not copied to Supabase when you switch.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run e2e` | Full walkthrough in headless Chromium at 390 x 844: every screen and the flows that cross features. Build and start the app with an empty `.env` first, then pass the base URL: `npm run e2e -- http://localhost:3210`. Screenshots go to `.shots/final-*.png` |
| `npm run icons` | Redraw the PWA icons in `public/icons` |

`scripts/serve.sh start 3210` serves the last production build in the background and `scripts/serve.sh stop` ends it.

In development only, `/dev/ui` shows every design system component and `/dev/coach` fills the device with three weeks of demo data. Both answer 404 in a production build.

## Layout

```
docs/                  PRD and build conventions (Foundation API reference is in BUILD.md)
supabase/migrations/   SQL schema, run in number order
public/sw.js           service worker (install, push, local reminders)
scripts/               e2e walkthrough, icon drawing, serve helper
src/lib/types.ts       every table
src/lib/db/            data layer: generic interface, backends, hooks, typed helpers, local upgrades
src/lib/storage/       photos
src/lib/logic/         pure rules with tests
src/lib/ai/            the model id, client and fallback shape shared by the AI routes
src/lib/auth/          passcode (server and device) and the login limiter
src/lib/seed/          starting defaults
src/lib/blocks.ts      a day's schedule blocks, the one reader Today uses
src/components/ui/     design system
src/components/app/    app shell, lock screen, setup row
src/features/<name>/   each feature's components, data and server code
src/app/(app)/         screens, one folder per tab or feature
src/app/api/           auth, db proxy, storage, and each feature's routes
```
