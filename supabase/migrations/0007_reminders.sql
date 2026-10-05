-- Reminders: what the scheduled job has already sent, and when it last ran.
-- Server only. The cron route reads and writes these with the service role key.

create table if not exists reminder_sent (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null,
  -- "<date>:<reminder id>" or "<date>:<reminder id>:<block>". One row per send.
  key text not null unique
);
create index if not exists reminder_sent_date on reminder_sent (date);

create table if not exists reminder_run (
  id text primary key,
  created_at timestamptz not null default now(),
  last_run_at timestamptz not null
);

alter table reminder_sent enable row level security;
alter table reminder_run enable row level security;
