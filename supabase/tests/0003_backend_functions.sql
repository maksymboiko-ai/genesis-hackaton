-- Tests for 0003_backend_functions.sql. Run on a scratch database that has
-- all migrations applied (never on the shared one):
--   psql "$SCRATCH_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0003_backend_functions.sql
-- Every block raises on failure; everything runs in a transaction that is
-- rolled back at the end.

begin;

create temp table t_ids (name text primary key, id uuid);

-- create_curriculum ------------------------------------------------------------
do $$
declare
  v_child uuid;
  v_cur uuid;
  v_n int;
  v_positions int[];
  v_skills text[];
  v_section int;
begin
  insert into child (name, grade_level) values ('Test', 5) returning id into v_child;
  insert into t_ids values ('child', v_child);

  v_cur := create_curriculum(v_child, null, 'fractions', 'Math', 'Fractions',
    '[{"title":"A","objective":"a","skills":["s-one","s-two"],"book_section_index":2},
      {"title":"B","objective":"b","skills":[]},
      {"title":"C","objective":"c","skills":["s-three"],"book_section_index":null}]'::jsonb);
  insert into t_ids values ('curriculum', v_cur);

  select count(*), array_agg(position order by position) into v_n, v_positions
  from lesson where curriculum_id = v_cur;
  if v_n <> 3 or v_positions <> array[0,1,2] then
    raise exception 'create_curriculum: wrong lessons % %', v_n, v_positions;
  end if;

  select skills, book_section_index into v_skills, v_section from lesson where curriculum_id = v_cur and position = 0;
  if v_skills <> array['s-one','s-two'] or v_section <> 2 then
    raise exception 'create_curriculum: wrong lesson 0 % %', v_skills, v_section;
  end if;

  if exists (select 1 from lesson where curriculum_id = v_cur and (kind <> 'core' or content_status <> 'pending')) then
    raise exception 'create_curriculum: lessons must be core and pending';
  end if;

  -- Empty lesson list is refused and leaves nothing behind.
  begin
    perform create_curriculum(v_child, null, 'x', 'Math', 'X', '[]'::jsonb);
    raise exception 'create_curriculum: accepted empty lessons';
  exception when raise_exception then
    if sqlerrm like 'create_curriculum:%' then raise; end if;
  end;

  -- A bad lesson rolls back the curriculum insert too (atomicity).
  begin
    perform create_curriculum(v_child, null, 'y', 'Math', 'Y', '[{"title":null,"objective":"o"}]'::jsonb);
    raise exception 'create_curriculum: accepted a null title';
  exception when not_null_violation then null;
  end;
  if exists (select 1 from curriculum where prompt in ('x', 'y')) then
    raise exception 'create_curriculum: partial insert left behind';
  end if;

  raise notice 'create_curriculum: ok';
end $$;

rollback;
