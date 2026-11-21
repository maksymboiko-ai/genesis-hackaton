-- Streaks are saved on the server: one row per day a child finished a quiz,
-- in the child's own calendar (the browser's time zone at submit time).
-- The app derives the streak, freezes and the week view from these days, so
-- it survives a new device, a cleared browser and a deleted plan.

create table child_activity_day (
  child_id uuid not null references child(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (child_id, day)
);

-- Only the server (service role) touches it, like every other table.
alter table child_activity_day enable row level security;
revoke all on child_activity_day from anon, authenticated;

-- Days before this migration, from attempts already made. Their time zone is
-- unknown, so UTC.
insert into child_activity_day (child_id, day)
select distinct c.child_id, (a.created_at at time zone 'UTC')::date
from attempt a
join lesson l on l.id = a.lesson_id
join curriculum c on c.id = l.curriculum_id
on conflict do nothing;
