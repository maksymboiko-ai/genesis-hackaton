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

-- claim_lesson ------------------------------------------------------------------
do $$
declare
  v_lesson uuid;
begin
  select l.id into v_lesson from lesson l join t_ids t on t.name = 'curriculum' and l.curriculum_id = t.id where l.position = 0;

  if not claim_lesson(v_lesson, now() - interval '3 minutes', now() - interval '1 minute') then
    raise exception 'claim_lesson: first claim failed';
  end if;
  if claim_lesson(v_lesson, now() - interval '3 minutes', now() - interval '1 minute') then
    raise exception 'claim_lesson: second claim succeeded while generating';
  end if;
  if (select content_status from lesson where id = v_lesson) <> 'generating'
     or (select generation_started_at from lesson where id = v_lesson) is null then
    raise exception 'claim_lesson: row not marked generating';
  end if;

  -- A job that started long ago is considered dead and can be reclaimed.
  update lesson set generation_started_at = now() - interval '10 minutes' where id = v_lesson;
  if not claim_lesson(v_lesson, now() - interval '3 minutes', now() - interval '1 minute') then
    raise exception 'claim_lesson: stale job not reclaimed';
  end if;

  -- Ready lessons are never claimed.
  update lesson set content_status = 'ready' where id = v_lesson;
  if claim_lesson(v_lesson, now() + interval '1 day', now() + interval '1 day') then
    raise exception 'claim_lesson: claimed a ready lesson';
  end if;
  -- A failed lesson is retried only after the cooldown.
  update lesson set content_status = 'failed', generation_started_at = now() where id = v_lesson;
  if claim_lesson(v_lesson, now() - interval '3 minutes', now() - interval '1 minute') then
    raise exception 'claim_lesson: failed lesson retried inside the cooldown';
  end if;
  update lesson set generation_started_at = now() - interval '2 minutes' where id = v_lesson;
  if not claim_lesson(v_lesson, now() - interval '3 minutes', now() - interval '1 minute') then
    raise exception 'claim_lesson: failed lesson not retried after the cooldown';
  end if;

  if claim_lesson(gen_random_uuid(), now(), now()) then
    raise exception 'claim_lesson: claimed a missing lesson';
  end if;
  raise notice 'claim_lesson: ok';
end $$;

rollback;
