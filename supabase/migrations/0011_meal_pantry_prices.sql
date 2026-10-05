-- The pantry, receipt price corrections and the preferred store get homes of
-- their own. They used to live on one reserved meal_plan row dated 2000-01-03
-- (its grocery_item rows were the pantry entries and the corrected prices).
-- That row's data is moved here and the row is removed.

create table pantry_item (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  name text not null unique
);

create table receipt_price (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  name text not null,
  store text not null,
  price numeric not null,
  unique (name, store)
);

alter table app_settings add column preferred_store text;

alter table pantry_item enable row level security;
alter table receipt_price enable row level security;

insert into pantry_item (name)
select distinct lower(trim(g.name))
from grocery_item g
join meal_plan p on p.id = g.plan_id
where p.week_start = date '2000-01-03' and g.category = '@pantry'
on conflict (name) do nothing;

insert into receipt_price (name, store, price)
select lower(trim(g.name)), e.key, (e.value)::numeric
from grocery_item g
join meal_plan p on p.id = g.plan_id
cross join lateral jsonb_each_text(coalesce(g.prices, '{}'::jsonb)) as e
where p.week_start = date '2000-01-03' and g.category = '@price'
on conflict (name, store) do nothing;

update app_settings
set preferred_store = (select store from meal_plan where week_start = date '2000-01-03');

-- An app that was already set up and never opened Meals has no reserved row.
-- It gets the staples that are assumed to be at home, the same list a new
-- install is seeded with (STAPLES in src/lib/logic/mealsFoods.ts).
insert into pantry_item (name)
select s.name
from (values ('olive oil'), ('soy sauce'), ('salt'), ('black pepper'), ('garlic powder'), ('chili powder'), ('cumin'), ('paprika'), ('italian seasoning'), ('cinnamon')) as s (name)
where exists (select 1 from app_settings where seeded)
  and not exists (select 1 from meal_plan where week_start = date '2000-01-03')
on conflict (name) do nothing;

-- grocery_item rows go with it (on delete cascade).
delete from meal_plan where week_start = date '2000-01-03';
