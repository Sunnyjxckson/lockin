-- The coach as a chat. One row per message, yours or the coach's. `trigger`
-- says why a coach message was written: an answer in the chat, or a check-in
-- it sent by itself (after the workout block, after a slip, after a missed
-- item). `check_key` is the one thing a check-in is about, so the same one is
-- never sent twice. `quote` is the line from the library it used, so the same
-- line does not come back within a week.

create table coach_message (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null,
  sent_at timestamptz not null default now(),
  sender text not null check (sender in ('me', 'coach')),
  body text not null,
  trigger text not null default 'chat' check (trigger in ('chat', 'post_workout', 'slip', 'missed_item')),
  source text check (source in ('ai', 'fallback')),
  quote text,
  check_key text unique,
  read boolean not null default true
);
create index coach_message_sent_at on coach_message (sent_at);
alter table coach_message enable row level security;

-- The voice the coach answers in, and which check-ins it may send.
alter table app_settings add column coach_voice text;
alter table app_settings add column coach_checkins jsonb;
update app_settings set coach_voice = 'stoic' where coach_voice is null;
update app_settings set coach_checkins = '{"post_workout": true, "slip": true, "missed_item": true}'::jsonb where coach_checkins is null;
