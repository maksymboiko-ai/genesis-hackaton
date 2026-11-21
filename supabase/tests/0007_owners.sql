-- Tests for 0007_owners.sql. Needs auth.users (Supabase creates it; on a
-- plain Postgres: create schema auth; create table auth.users (id uuid primary key);).
begin;

do $$
declare
  v_parent uuid := gen_random_uuid();
  v_child uuid;
begin
  insert into auth.users (id) values (v_parent);
  insert into child (owner_id, name, grade_level) values (v_parent, 'Owned', 4) returning id into v_child;
  insert into book (owner_id, title, storage_path) values (v_parent, 'B', 'books/b.pdf');

  -- An owner must be a real account.
  begin
    insert into child (owner_id, name, grade_level) values (gen_random_uuid(), 'Nobody', 4);
    raise exception 'owners: accepted an unknown owner';
  exception when foreign_key_violation then null;
  end;

  -- Deleting the account deletes the parent's data.
  delete from auth.users where id = v_parent;
  if exists (select 1 from child where id = v_child) or exists (select 1 from book where owner_id = v_parent) then
    raise exception 'owners: data left after the account was deleted';
  end if;
  raise notice 'owners: ok';
end $$;

rollback;
