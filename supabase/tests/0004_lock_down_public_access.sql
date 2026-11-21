-- Tests for 0004_lock_down_public_access.sql. Needs the Supabase roles; on a
-- plain Postgres create them first (see the comment at the bottom).
begin;

insert into child (name, grade_level) values ('Private', 4);

-- anon: no rows, no writes, no function calls.
set local role anon;
do $$
begin
  if exists (select 1 from child) then
    raise exception 'anon can read child rows';
  end if;
  begin
    insert into child (name, grade_level) values ('x', 3);
    raise exception 'anon can insert child rows';
  exception when insufficient_privilege then null;
  end;
  begin
    perform claim_replan(gen_random_uuid(), now());
    raise exception 'anon can execute claim_replan';
  exception when insufficient_privilege then null;
  end;
  raise notice 'anon locked out: ok';
end $$;
reset role;

-- service_role (BYPASSRLS): unaffected.
set local role service_role;
do $$
begin
  if not exists (select 1 from child where name = 'Private') then
    raise exception 'service_role cannot read child rows';
  end if;
  perform claim_replan(gen_random_uuid(), now());
  raise notice 'service_role unaffected: ok';
end $$;
reset role;

rollback;

-- Roles as Supabase creates them, for a plain Postgres:
--   create role anon nologin; create role authenticated nologin;
--   create role service_role nologin bypassrls;
--   grant usage on schema public to anon, authenticated, service_role;
--   alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
--   alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
