-- Tests for 0009_subscriptions.sql.
begin;

do $$
declare
  v_parent uuid := gen_random_uuid();
begin
  insert into auth.users (id) values (v_parent);
  insert into subscription (owner_id, plan, trial_ends_at) values (v_parent, 'yearly', now() + interval '7 days');

  -- One trial per account.
  insert into subscription (owner_id, plan, trial_ends_at)
  values (v_parent, 'monthly', now() + interval '7 days')
  on conflict do nothing;
  if (select plan from subscription where owner_id = v_parent) <> 'yearly' then
    raise exception 'subscription: a second trial replaced the first';
  end if;

  -- Only the plans the paywall sells.
  begin
    update subscription set plan = 'lifetime' where owner_id = v_parent;
    raise exception 'subscription: accepted an unknown plan';
  exception when check_violation then null;
  end;

  -- A trial cannot end before it starts.
  begin
    update subscription set trial_ends_at = trial_started_at - interval '1 day' where owner_id = v_parent;
    raise exception 'subscription: accepted a trial that ends before it starts';
  exception when check_violation then null;
  end;

  -- A subscription belongs to a real account.
  begin
    insert into subscription (owner_id, plan, trial_ends_at) values (gen_random_uuid(), 'yearly', now() + interval '7 days');
    raise exception 'subscription: accepted an unknown owner';
  exception when foreign_key_violation then null;
  end;

  -- The public roles cannot read it.
  if has_table_privilege('anon', 'subscription', 'select')
     or has_table_privilege('authenticated', 'subscription', 'select') then
    raise exception 'subscription: readable by a public role';
  end if;

  -- Deleting the account deletes its subscription.
  delete from auth.users where id = v_parent;
  if exists (select 1 from subscription where owner_id = v_parent) then
    raise exception 'subscription: row left after the account was deleted';
  end if;
  raise notice 'subscription: ok';
end $$;

rollback;
