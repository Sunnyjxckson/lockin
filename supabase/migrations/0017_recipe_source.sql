-- Recipes found on the web: where each one came from, and how long it takes.
-- source gains the value 'web' (it is plain text, so nothing to alter).
--
-- Run this whole file once in the Supabase SQL editor. Until it has run the
-- app works as before; saving a web recipe leaves these columns out.

alter table recipe add column source_url text;
alter table recipe add column source_name text;
alter table recipe add column minutes integer;
