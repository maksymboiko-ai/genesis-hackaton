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

-- record_attempt ----------------------------------------------------------------
do $$
declare
  v_child uuid := (select id from t_ids where name = 'child');
  v_lesson uuid;
  v_attempt uuid;
  v_first timestamptz;
begin
  select l.id into v_lesson from lesson l join t_ids t on t.name = 'curriculum' and l.curriculum_id = t.id where l.position = 1;

  v_attempt := record_attempt(v_lesson, 0.5, '[{"questionId":"q1"}]'::jsonb, v_child, 'Math',
    '[{"skill":"s-one","mastery":0.65},{"skill":"s-two","mastery":0.35}]'::jsonb);
  if not exists (select 1 from attempt where id = v_attempt and score = 0.5) then
    raise exception 'record_attempt: attempt not stored';
  end if;
  select completed_at into v_first from lesson where id = v_lesson;
  if v_first is null or (select last_score from lesson where id = v_lesson) <> 0.5 then
    raise exception 'record_attempt: lesson not completed';
  end if;
  if (select count(*) from skill_mastery where child_id = v_child and subject = 'Math') <> 2 then
    raise exception 'record_attempt: mastery not inserted';
  end if;

  -- Second attempt: upsert mastery, keep the first completion time.
  perform pg_sleep(0.01);
  perform record_attempt(v_lesson, 1, '[]'::jsonb, v_child, 'Math', '[{"skill":"s-one","mastery":0.8}]'::jsonb);
  if abs((select mastery from skill_mastery where child_id = v_child and skill = 's-one') - 0.8) > 1e-6 then
    raise exception 'record_attempt: mastery not updated';
  end if;
  if (select completed_at from lesson where id = v_lesson) <> v_first or (select last_score from lesson where id = v_lesson) <> 1 then
    raise exception 'record_attempt: completion time changed or score not updated';
  end if;

  -- Out-of-range mastery violates the check and rolls back the whole attempt.
  begin
    perform record_attempt(v_lesson, 0.3, '[]'::jsonb, v_child, 'Math', '[{"skill":"s-one","mastery":1.5}]'::jsonb);
    raise exception 'record_attempt: accepted mastery 1.5';
  exception when check_violation then null;
  end;
  if exists (select 1 from attempt where lesson_id = v_lesson and score = 0.3) then
    raise exception 'record_attempt: partial insert left behind';
  end if;
  raise notice 'record_attempt: ok';
end $$;

-- claim_replan, apply_replan ---------------------------------------------------
do $$
declare
  v_cur uuid := (select id from t_ids where name = 'curriculum');
  v_ids uuid[];
  v_titles text[];
  v_positions int[];
  v_first uuid;
begin
  if not claim_replan(v_cur, now() - interval '3 minutes') then
    raise exception 'claim_replan: first claim failed';
  end if;
  if claim_replan(v_cur, now() - interval '3 minutes') then
    raise exception 'claim_replan: second claim succeeded while running';
  end if;
  update curriculum set replan_started_at = now() - interval '10 minutes' where id = v_cur;
  if not claim_replan(v_cur, now() - interval '3 minutes') then
    raise exception 'claim_replan: stale replan not reclaimed';
  end if;

  -- Lessons A(0) B(1) C(2); insert two after B, i.e. at position 2.
  select id into v_first from lesson where curriculum_id = v_cur and position = 0;
  v_ids := apply_replan(v_cur, 2,
    jsonb_build_array(
      jsonb_build_object('kind','remedial','title','R','objective','r','skills',jsonb_build_array('s-one'),'retry_of_lesson_id',null,'book_section_index',null),
      jsonb_build_object('kind','retry','title','A','objective','a','skills',jsonb_build_array('s-one'),'retry_of_lesson_id',v_first,'book_section_index',2)),
    'struggling', '{"summary":"s","mistakes":[],"missingSkills":["s-one"]}'::jsonb);

  if array_length(v_ids, 1) <> 2 then
    raise exception 'apply_replan: wrong ids %', v_ids;
  end if;
  select array_agg(title order by position), array_agg(position order by position)
    into v_titles, v_positions from lesson where curriculum_id = v_cur;
  if v_titles <> array['A','B','R','A','C'] or v_positions <> array[0,1,2,3,4] then
    raise exception 'apply_replan: wrong order % %', v_titles, v_positions;
  end if;
  if (select retry_of_lesson_id from lesson where id = v_ids[2]) <> v_first
     or (select book_section_index from lesson where id = v_ids[2]) <> 2
     or (select kind from lesson where id = v_ids[1]) <> 'remedial' then
    raise exception 'apply_replan: wrong lesson fields';
  end if;
  if (select replan_status from curriculum where id = v_cur) <> 'idle'
     or (select last_replan_at from curriculum where id = v_cur) is null
     or (select replan_started_at from curriculum where id = v_cur) is not null then
    raise exception 'apply_replan: curriculum not released';
  end if;
  if (select inserted_lesson_ids from replan_event where curriculum_id = v_cur) <> v_ids then
    raise exception 'apply_replan: event ids wrong';
  end if;

  -- Append at the end (excelling).
  v_ids := apply_replan(v_cur, 5,
    jsonb_build_array(jsonb_build_object('kind','extension','title','E','objective','e','skills',jsonb_build_array('s-x'))),
    'excelling', '{"summary":"s","mistakes":[],"missingSkills":[]}'::jsonb);
  select array_agg(title order by position) into v_titles from lesson where curriculum_id = v_cur;
  if v_titles <> array['A','B','R','A','C','E'] then
    raise exception 'apply_replan: append wrong %', v_titles;
  end if;

  -- A bad lesson kind rolls everything back: positions, event and status.
  perform claim_replan(v_cur, now());
  begin
    perform apply_replan(v_cur, 0,
      jsonb_build_array(jsonb_build_object('kind','bogus','title','X','objective','x')),
      'struggling', '{}'::jsonb);
    raise exception 'apply_replan: accepted a bad kind';
  exception when check_violation then null;
  end;
  select array_agg(position order by position) into v_positions from lesson where curriculum_id = v_cur;
  if v_positions <> array[0,1,2,3,4,5] or (select count(*) from replan_event where curriculum_id = v_cur) <> 2
     or (select replan_status from curriculum where id = v_cur) <> 'running' then
    raise exception 'apply_replan: partial write left behind';
  end if;
  raise notice 'claim_replan / apply_replan: ok';
end $$;

rollback;
