-- Tests for 0008_activity_days.sql.
begin;

do $$
declare
  v_child uuid;
begin
  insert into child (name, grade_level) values ('Streak', 3) returning id into v_child;

  -- One row per day: a second quiz the same day changes nothing.
  insert into child_activity_day (child_id, day) values (v_child, '2026-11-20');
  insert into child_activity_day (child_id, day) values (v_child, '2026-11-20') on conflict do nothing;
  insert into child_activity_day (child_id, day) values (v_child, '2026-11-21');
  if (select count(*) from child_activity_day where child_id = v_child) <> 2 then
    raise exception 'activity: duplicate day kept';
  end if;

  -- The public roles cannot read it.
  if has_table_privilege('anon', 'child_activity_day', 'select')
     or has_table_privilege('authenticated', 'child_activity_day', 'select') then
    raise exception 'activity: readable by a public role';
  end if;

  -- Deleting the child deletes its days.
  delete from child where id = v_child;
  if exists (select 1 from child_activity_day where child_id = v_child) then
    raise exception 'activity: days left after the child was deleted';
  end if;
  raise notice 'activity: ok';
end $$;

rollback;
