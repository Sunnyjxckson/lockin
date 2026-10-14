-- Food onboarding and the food goal.
--
-- cook_minutes: how long you have to cook on a weeknight (15, 30, 45 or 60).
-- food_onboarded: true once the first-run food questions have been answered
-- or skipped, so they are not asked again.
-- goal: cut, maintain or bulk. Null until one is chosen.
--
-- Run this whole file once in the Supabase SQL editor. Until it has run the
-- app works as before; a settings save leaves these columns out instead of
-- failing.

alter table app_settings add column cook_minutes integer not null default 30;
alter table app_settings add column food_onboarded boolean not null default false;
alter table app_settings add column goal text;
