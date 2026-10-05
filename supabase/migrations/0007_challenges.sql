-- Ongoing mode with challenges as an optional layer on top.
--
-- Logs (day_log, earning, meal, set_log, vice_slip, body_log) were always
-- keyed by date and never pointed at a challenge, so nothing in them moves.
-- The challenge table goes from one fixed row to one row per challenge: the
-- row that is there becomes the first, active challenge and keeps its id,
-- dates and money target.

alter table challenge add column name text not null default 'Lock in';
alter table challenge add column status text not null default 'active' check (status in ('active', 'ended', 'succeeded', 'abandoned'));
alter table challenge add column ended_on date;
alter table challenge add column rules jsonb;
alter table challenge add column restart_of text;

-- A challenge does not have to carry a money target.
alter table challenge alter column money_target drop not null;
alter table challenge alter column money_deadline drop not null;

-- Version 1 only ever wrote one row. If there is more than one, the oldest
-- stays active and the rest are kept as ended.
update challenge
set status = 'ended', ended_on = start_date + (length_days - 1)
where id <> (select id from challenge order by created_at, id limit 1);

-- At most one active challenge.
create unique index challenge_one_active on challenge (status) where status = 'active';
create index challenge_start on challenge (start_date);

-- The ongoing history: where it starts, and the daily floor that applies with
-- or without a challenge.
alter table app_settings add column history_start date;
alter table app_settings add column daily_floor numeric not null default 100;

update app_settings
set
  history_start = least(
    coalesce((select min(start_date) from challenge), (created_at at time zone 'America/New_York')::date),
    coalesce((select min(date) from day_log), (created_at at time zone 'America/New_York')::date),
    (created_at at time zone 'America/New_York')::date
  ),
  daily_floor = coalesce((select daily_floor from challenge order by created_at, id limit 1), 100);
