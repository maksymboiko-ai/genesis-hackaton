-- Trials and payments: one row per parent account (Subscription in
-- web/src/contracts/domain.ts). The row is created when the parent starts the
-- free trial on the paywall. Trial-to-paid conversion on the admin dashboard
-- is read from here.

create table subscription (
  owner_id         uuid primary key references auth.users(id) on delete cascade,
  plan             text not null check (plan in ('yearly', 'monthly')),
  trial_started_at timestamptz not null default now(),
  -- trial_started_at + TRIAL_DAYS, set by the backend.
  trial_ends_at    timestamptz not null,
  -- When the first payment went through. Nothing sets it yet: the app has no
  -- billing provider. Its webhook is the one place that should.
  paid_at          timestamptz,
  check (trial_ends_at > trial_started_at)
);

-- Only the server (service role) touches it, like every other table.
alter table subscription enable row level security;
revoke all on subscription from anon, authenticated;
