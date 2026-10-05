-- Passcode rate limiting that holds across serverless instances.
-- One row, id 'passcode'. Server only.

create table login_attempt (
  id text primary key,
  created_at timestamptz not null default now(),
  failures integer not null default 0,
  locked_until timestamptz
);

alter table login_attempt enable row level security;
