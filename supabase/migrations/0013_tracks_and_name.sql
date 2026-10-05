-- The four tracks Today sums the day up in (body, money, mind, clean). Null
-- on an item means the default for it (logic/tracks). And the name Today
-- greets, which Settings can change or clear.

alter table checklist_item add column track text;
alter table app_settings add column display_name text;
update app_settings set display_name = 'Sunny' where display_name is null;
