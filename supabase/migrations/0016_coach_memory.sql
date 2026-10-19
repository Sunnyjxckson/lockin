-- The coach as part coach, part therapist. Two new tables and one wider check.
--
-- coach_profile: what the coach keeps about you between conversations. Your
-- why, what sets off slips, what has actually gotten you moving, what you are
-- working on, things you said that mattered. You can read, edit and delete
-- every row on the coach notes page.
--
-- coach_commitment: something you told the coach you would do ("lifting at
-- 6:30"). The coach asks after it is due, and you answer by tap or by reply.
--
-- Run this whole file once in the Supabase SQL editor. Until it has run the
-- app works as before: the profile and commitments are simply empty, and a
-- check-in that needs the wider check below is saved as a plain chat message.

create table coach_profile (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('why', 'trigger', 'what_works', 'working_on', 'said')),
  body text not null,
  updated_at timestamptz not null default now()
);
create index coach_profile_kind on coach_profile (kind);
alter table coach_profile enable row level security;

create table coach_commitment (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  body text not null,
  made_on date not null,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'done', 'missed', 'dropped')),
  asked_at timestamptz
);
create index coach_commitment_due on coach_commitment (due_at);
alter table coach_commitment enable row level security;

-- Two more reasons the coach may write first: asking after a commitment, and
-- reaching out when you drift.
alter table coach_message drop constraint if exists coach_message_trigger_check;
alter table coach_message add constraint coach_message_trigger_check check (trigger in ('chat', 'post_workout', 'slip', 'missed_item', 'commitment', 'drift'));
