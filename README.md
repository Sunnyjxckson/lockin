# Lock In

A single-user, mobile-first PWA that runs a 30 day challenge: one checklist, a fixed schedule, money, body, and streaks in one place. The spec is `docs/PRD.md`. The rules for working in this repo are in `docs/BUILD.md`.

## Run it

Needs Node 22.

```
npm install
npm run dev
```

Open http://localhost:3000 on a phone-sized window. With no environment variables the app is fully usable: it asks you to create a 4 digit passcode, seeds the challenge, checklist, schedule, workouts and reminders, and keeps everything on the device.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run e2e` | Click-through in headless Chromium at 390 x 844. Start the app first. Pass a base URL to use another port: `npm run e2e -- http://localhost:3210` |
| `npm run icons` | Redraw the PWA icons in `public/icons` |

`/dev/ui` shows every design system component.

## Where data lives

| Setup | Data | Photos | Passcode |
| --- | --- | --- | --- |
| Nothing set | localStorage on the device | IndexedDB on the device | Created on the device, stored as a salted hash |
| `LOCKIN_PASSCODE` set | same | same | Checked on the server, httpOnly cookie for 30 days |
| Supabase set | Supabase, through `/api/db` | Supabase Storage, through `/api/storage` | `LOCKIN_PASSCODE` is required |

Device data does not sync between devices and is lost if the browser's site data is cleared. Use Supabase for anything you want to keep.

## Setup for each service

Copy `.env.example` to `.env.local`. Every variable is optional.

### Passcode

Set `LOCKIN_PASSCODE` to 4 to 8 digits. Changing it signs every device out.

### Supabase

1. Create a project at supabase.com.
2. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`). It creates the tables, turns row level security on with no policies, and creates the public `photos` bucket.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project settings, API), and `LOCKIN_PASSCODE`.
4. Restart. First load seeds the database.

The service role key never reaches the browser. The browser calls `/api/db`, which checks the passcode cookie and then talks to Supabase. The public anon key can read nothing. Photos are in a public bucket at random paths: anyone with a photo's full URL can open it, nobody can list them.

### Claude API

Set `ANTHROPIC_API_KEY`. Without it the coach and the photo readers return rule-based fallbacks marked `source: "fallback"`.

### Google Calendar

Create an OAuth client (Web application) in Google Cloud with the Calendar API enabled, add your redirect URI, and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI`. Without them the app shows calendar sync as not connected.

### Web push

Run `npx web-push generate-vapid-keys` and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Push needs Supabase too, since the server has to read reminders and subscriptions. On an iPhone, push only works after the app is added to the home screen.

## Deploy

Push to Vercel and set the environment variables there. Add to the home screen from Safari or Chrome to install it.

## Layout

```
docs/                  PRD and build conventions (Foundation API reference is in BUILD.md)
supabase/migrations/   SQL schema
public/sw.js           service worker (install and push)
scripts/               e2e click-through, icon drawing
src/lib/types.ts       every table
src/lib/db/            data layer: generic interface, backends, hooks, typed helpers
src/lib/storage/       photos
src/lib/logic/         pure rules with tests: dates, day, streaks, targets
src/lib/seed/          starting defaults
src/lib/blocks.ts      a day's schedule blocks, the one reader Today uses
src/lib/auth/          passcode, server and device
src/components/ui/     design system
src/components/app/    app shell, lock screen
src/app/(app)/         screens, one folder per tab or feature
src/app/api/           auth, db proxy, storage
```
