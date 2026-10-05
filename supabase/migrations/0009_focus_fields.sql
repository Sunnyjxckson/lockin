-- Focus sessions keep what the timer knew: how often and how long the app was
-- left, the wall clock length, the countdown length and whether it was
-- reached. A running timer (end null) also carries its pauses and time away in
-- "live", so the same clock shows on another device. The business goal moves
-- from the device into settings.

alter table focus_session add column away_count integer not null default 0;
alter table focus_session add column away_minutes integer not null default 0;
alter table focus_session add column clock_minutes integer;
alter table focus_session add column planned_minutes integer;
alter table focus_session add column completed boolean not null default false;
alter table focus_session add column live jsonb;

alter table app_settings add column business_goal text;
