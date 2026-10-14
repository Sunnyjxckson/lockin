-- The quote on the lock screen (PRD 28). One quote is pinned at a time, with
-- who said it, the library quote it came from (null for a line you wrote),
-- when it was pinned and the look of the wallpaper:
-- { text, by, quote_id, pinned_at, wallpaper_style }.
--
-- lockscreen_token is the secret in the wallpaper link that an iOS Shortcuts
-- automation opens each morning. It is made in the app and is not the passcode.
--
-- Run this whole file once in the Supabase SQL editor. Until it has run the
-- app works as before; pinning a quote leaves the new columns out instead of
-- failing, and the lock screen says to run the file.

alter table app_settings add column pinned_quote jsonb;
alter table app_settings add column lockscreen_token text;
