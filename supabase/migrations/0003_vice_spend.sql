-- Vices: the typical spend gets real columns. It used to be kept in
-- checklist_item.hint as the sentence "Usually $40 a week".

alter table checklist_item add column typical_spend numeric;
alter table checklist_item add column spend_period text check (spend_period in ('day', 'week'));

update checklist_item
set typical_spend = (regexp_match(hint, '^Usually \$([0-9]+(\.[0-9]+)?) a (day|week)$'))[1]::numeric,
    spend_period = (regexp_match(hint, '^Usually \$([0-9]+(\.[0-9]+)?) a (day|week)$'))[3],
    hint = null
where hint ~ '^Usually \$[0-9]+(\.[0-9]+)? a (day|week)$';
