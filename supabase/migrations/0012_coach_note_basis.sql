-- What a morning brief was written from: the challenge running that day, its
-- money target and the daily floor, as one short string. When any of them
-- changes later that day the brief no longer matches and is written again.
-- Null for notes written before this, and for flags and weekly reviews.

alter table coach_note add column basis text;
