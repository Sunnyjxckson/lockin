-- Tables for mood and motivation, mood boards and themes, meal planning with
-- a grocery list, grocery spending, and focus sessions. Same rules as the
-- rest: text ids, New York calendar dates, "HH:MM" clock times, row level
-- security on with no policies.

create table mood_log (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null,
  time text not null,
  mood smallint not null check (mood between 1 and 5),
  note text
);
create index mood_log_date on mood_log (date);

create table motivation (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('quote', 'clip', 'why')),
  body text not null,
  url text,
  sort_order integer not null default 0
);

create table board (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  name text not null,
  kind text not null default 'life' check (kind in ('body', 'brand', 'life')),
  cover_item_id text,
  sort_order integer not null default 0
);

create table board_item (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  board_id text not null references board (id) on delete cascade,
  kind text not null default 'image' check (kind in ('image', 'color', 'note')),
  image_url text,
  note text,
  color text,
  palette jsonb,
  source text check (source in ('camera', 'web', 'screenshot', 'upload')),
  source_url text,
  sort_order integer not null default 0
);
create index board_item_board on board_item (board_id);

create table theme (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  name text,
  base text not null default 'dark' check (base in ('dark', 'contrast')),
  palette jsonb,
  accent text,
  board_id text references board (id) on delete set null,
  active boolean not null default false
);
create unique index theme_one_active on theme (active) where active;

create table recipe (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  name text not null,
  slot text not null default 'dinner' check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  servings numeric not null default 1,
  calories numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  est_cost numeric not null default 0,
  tags jsonb not null default '[]'::jsonb,
  photo_url text,
  source text not null default 'user' check (source in ('seed', 'user', 'ai'))
);

create table meal_plan (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  week_start date not null unique,
  budget numeric not null default 0,
  recipe_ids jsonb not null default '[]'::jsonb,
  meals jsonb not null default '[]'::jsonb,
  total_cost numeric not null default 0,
  store text
);

create table grocery_item (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  plan_id text not null references meal_plan (id) on delete cascade,
  name text not null,
  quantity numeric not null default 1,
  unit text,
  category text,
  store text,
  price numeric,
  prices jsonb,
  bought boolean not null default false
);
create index grocery_item_plan on grocery_item (plan_id);

create table expense (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null,
  amount numeric not null,
  category text not null default 'groceries',
  note text,
  store text,
  plan_id text references meal_plan (id) on delete set null
);
create index expense_date on expense (date);

create table focus_session (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null,
  start text not null,
  "end" text,
  minutes integer not null default 0,
  label text,
  source text not null default 'timer' check (source in ('timer', 'manual')),
  block_id text
);
create index focus_session_date on focus_session (date);

-- Food planning and focus settings.
alter table app_settings add column weekly_food_budget numeric;
alter table app_settings add column food_likes jsonb not null default '[]'::jsonb;
alter table app_settings add column food_dislikes jsonb not null default '[]'::jsonb;
alter table app_settings add column focus_goal_minutes integer not null default 60;

alter table mood_log enable row level security;
alter table motivation enable row level security;
alter table board enable row level security;
alter table board_item enable row level security;
alter table theme enable row level security;
alter table recipe enable row level security;
alter table meal_plan enable row level security;
alter table grocery_item enable row level security;
alter table expense enable row level security;
alter table focus_session enable row level security;
