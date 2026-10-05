-- One source of truth for scoring: day_log carries how many slips were logged
-- for the item that day. Above zero the item is not done, so Today, Progress,
-- streaks and the coach all agree without each reading vice_slip.

alter table day_log add column slips integer not null default 0;

insert into day_log (date, item_id, checked, slips)
select s.date, s.item_id, false, count(*)
from vice_slip s
group by s.date, s.item_id
on conflict (date, item_id) do update set slips = excluded.slips;
