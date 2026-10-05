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
