-- The Library: what you did with each quote, where the reader was left, and
-- the philosophy drops setting. The quotes themselves are static files
-- shipped with the app, so this holds state only. One row per quote, written
-- the first time it is read or saved. `writer` and `work` are slugs, kept here
-- so the counters per writer and per work need no quote file loaded.
--
-- Run this whole file once in the Supabase SQL editor. Until it has run the
-- app works as before; the Library shows one line saying to run it, and
-- saving a setting leaves the new columns out instead of failing.

create table quote_state (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  quote_id text not null unique,
  writer text not null,
  work text not null,
  read_at timestamptz,
  saved_at timestamptz,
  note text
);
create index quote_state_writer on quote_state (writer);
alter table quote_state enable row level security;

-- Where the reader was left: { scope, quote_id, at, seed }.
alter table app_settings add column library_position jsonb;

-- Philosophy drops: a quote through the day as a notification. Off until
-- turned on in Settings, Reminders. How many a day, one to six.
alter table app_settings add column drops_enabled boolean not null default false;
alter table app_settings add column drops_per_day smallint not null default 3;
