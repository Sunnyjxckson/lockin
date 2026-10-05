-- Money: the first date that counts toward the current target. Null means the
-- challenge start. Resetting the target sets it, so the new target starts a
-- fresh running total while the all time total still counts everything.

alter table challenge add column money_target_start date;
