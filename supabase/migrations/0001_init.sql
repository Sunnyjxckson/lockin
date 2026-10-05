-- Lock In, initial schema.
-- Mirrors src/lib/types.ts column for column (checked by src/lib/db/schema.test.ts).
--
-- Dates are calendar dates in America/New_York. Clock times are "HH:MM" text.
-- Ids are text so the client can make them (crypto.randomUUID) and the two
-- single-row tables can use fixed ids ("challenge", "app").
--
-- Access: row level security is on with no policies, so the public anon key
-- can read nothing. The app reaches the database only from the server with
-- the service role key, behind the passcode cookie (src/app/api/db).

create extension if not exists pgcrypto;

create table challenge (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  start_date date not null,
  length_days integer not null check (length_days > 0),
  money_target numeric not null,
  money_deadline date not null,
  daily_floor numeric not null
);

create table checklist_item (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  key text,
  name text not null,
  type text not null check (type in ('yesno', 'number', 'text')),
  cadence text not null check (cadence in ('daily', 'weekly')),
  target jsonb not null,
  category text not null check (category in ('habit', 'vice')),
  mode text check (mode in ('quit', 'cap')),
  unit text,
  hint text,
  sort_order integer not null default 0,
  active boolean not null default true,
  archived boolean not null default false,
  weekly_day smallint check (weekly_day between 0 and 6),
  with_photo boolean not null default false,
  tracks_money boolean not null default false
);
create unique index checklist_item_key on checklist_item (key) where key is not null;

create table target_version (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  item_id text not null references checklist_item (id) on delete cascade,
  effective_from date not null,
  target jsonb not null,
  active boolean not null default true,
  unique (item_id, effective_from)
);

create table day_log (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null,
  item_id text not null references checklist_item (id) on delete cascade,
  value numeric,
  checked boolean not null default false,
  text text,
  completed_at timestamptz,
  unique (date, item_id)
);

create table vice_slip (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  item_id text not null references checklist_item (id) on delete cascade,
  date date not null,
  time text not null,
  trigger text,
  amount numeric
);
create index vice_slip_item_date on vice_slip (item_id, date);

create table schedule_template (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  weekday smallint not null check (weekday between 0 and 6),
  block_name text not null,
  start text not null,
  "end" text not null,
  kind text not null default 'other',
  flexible boolean not null default true,
  note text
);
create index schedule_template_weekday on schedule_template (weekday);

create table schedule_block (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null,
  block_name text not null,
  start text not null,
  "end" text not null,
  duration integer not null,
  flexible boolean not null default true,
  kind text not null default 'other',
  note text,
  calendar_event_id text,
  template_id text,
  source text not null default 'manual' check (source in ('template', 'manual', 'calendar'))
);
create index schedule_block_date on schedule_block (date);

create table earning (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null,
  amount numeric not null,
  app text not null,
  hours numeric,
  screenshot_url text
);
create index earning_date on earning (date);

create table meal (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null,
  time text not null,
  name text,
  photo_url text,
  calories numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0
);
create index meal_date on meal (date);

create table saved_meal (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  name text not null,
  photo_url text,
  calories numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  use_count integer not null default 0
);

create table body_log (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null unique,
  weight numeric,
  photo_url text
);

create table workout (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  weekday smallint not null check (weekday between 0 and 6),
  slot text not null check (slot in ('main', 'core')),
  name text not null,
  kind text not null check (kind in ('lift', 'cardio', 'sport', 'rest')),
  detail text,
  exercises jsonb not null default '[]'::jsonb,
  unique (weekday, slot)
);

create table set_log (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null,
  exercise text not null,
  set_number integer not null,
  weight numeric,
  reps integer,
  unique (date, exercise, set_number)
);

create table reminder (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  kind text not null,
  label text not null,
  body text,
  time text,
  block_name text,
  item_id text references checklist_item (id) on delete set null,
  offset_minutes integer not null default 0,
  enabled boolean not null default true,
  sort_order integer not null default 0
);

create table coach_note (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null,
  kind text not null check (kind in ('morning', 'weekly', 'flag')),
  body text not null,
  source text not null default 'fallback' check (source in ('ai', 'fallback'))
);
create index coach_note_date on coach_note (date);

create table push_subscription (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text
);

create table calendar_token (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  provider text not null unique,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  calendar_id text,
  sync_token text
);

create table app_settings (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  seeded boolean not null default false,
  timezone text not null default 'America/New_York',
  quiet_start text not null default '23:00',
  quiet_end text not null default '05:30',
  carbs_target numeric not null default 180,
  fat_target numeric not null default 60,
  weight_unit text not null default 'lb' check (weight_unit in ('lb', 'kg')),
  haptics boolean not null default true
);

alter table challenge enable row level security;
alter table checklist_item enable row level security;
alter table target_version enable row level security;
alter table day_log enable row level security;
alter table vice_slip enable row level security;
alter table schedule_template enable row level security;
alter table schedule_block enable row level security;
alter table earning enable row level security;
alter table meal enable row level security;
alter table saved_meal enable row level security;
alter table body_log enable row level security;
alter table workout enable row level security;
alter table set_log enable row level security;
alter table reminder enable row level security;
alter table coach_note enable row level security;
alter table push_subscription enable row level security;
alter table calendar_token enable row level security;
alter table app_settings enable row level security;

-- Photo bucket. Public read at unguessable paths, writes only from the server.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;
