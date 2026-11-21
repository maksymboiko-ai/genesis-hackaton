-- Backend write functions and job timestamps. See docs/adr/0001.
-- Each function is one transaction, so multi-table writes are all or nothing.
-- Plain parameters only; no dynamic SQL. Business rules stay in TypeScript.

-- When a lesson was claimed for generation / a replan was started. A row left
-- in 'generating' / 'running' longer than the backend's timeout counts as
-- failed and can be claimed again.
alter table lesson add column generation_started_at timestamptz;
alter table curriculum add column replan_started_at timestamptz;

-- Lesson rows passed as jsonb: [{ kind, title, objective, skills[],
-- retry_of_lesson_id, book_section_index }]. Missing keys use the defaults.

-- A new curriculum and its core lessons, at positions 0..n-1.
create function create_curriculum(
  p_child_id uuid,
  p_book_id  uuid,
  p_prompt   text,
  p_subject  text,
  p_title    text,
  p_lessons  jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_lessons) is distinct from 'array' or jsonb_array_length(p_lessons) = 0 then
    raise exception 'p_lessons must be a non-empty array';
  end if;

  insert into curriculum (child_id, book_id, prompt, subject, title)
  values (p_child_id, p_book_id, p_prompt, p_subject, p_title)
  returning id into v_id;

  insert into lesson (curriculum_id, position, kind, title, objective, skills, book_section_index)
  select v_id,
         (l.ord - 1)::int,
         'core',
         l.value->>'title',
         l.value->>'objective',
         coalesce(array(select jsonb_array_elements_text(l.value->'skills')), '{}'),
         (l.value->>'book_section_index')::int
  from jsonb_array_elements(p_lessons) with ordinality as l(value, ord);

  return v_id;
end;
$$;

-- Claims a lesson for generation. True only for the one caller that moved it
-- to 'generating': from 'pending'; from 'failed' if the failed attempt started
-- before p_retry_before (a cooldown, so polling a failed lesson does not
-- retry it in a loop); or from a 'generating' job that started before
-- p_stale_before (a dead job).
create function claim_lesson(p_lesson_id uuid, p_stale_before timestamptz, p_retry_before timestamptz)
returns boolean
language sql
as $$
  with claimed as (
    update lesson
       set content_status = 'generating',
           generation_started_at = now()
     where id = p_lesson_id
       and (content_status = 'pending'
            or (content_status = 'failed'
                and (generation_started_at is null or generation_started_at < p_retry_before))
            or (content_status = 'generating'
                and (generation_started_at is null or generation_started_at < p_stale_before)))
    returning 1
  )
  select exists (select 1 from claimed);
$$;

-- Stores one graded attempt: the attempt row, the lesson's completion and
-- score, and the new mastery values (computed in TypeScript) in one
-- transaction. p_mastery: [{ skill, mastery }]. Returns the attempt id.
create function record_attempt(
  p_lesson_id uuid,
  p_score     real,
  p_results   jsonb,
  p_child_id  uuid,
  p_subject   text,
  p_mastery   jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into attempt (lesson_id, score, results)
  values (p_lesson_id, p_score, p_results)
  returning id into v_id;

  -- Any attempt completes the lesson, whatever the score.
  update lesson
     set completed_at = coalesce(completed_at, now()),
         last_score = p_score
   where id = p_lesson_id;

  insert into skill_mastery (child_id, subject, skill, mastery, updated_at)
  select p_child_id, p_subject, m.value->>'skill', (m.value->>'mastery')::real, now()
  from jsonb_array_elements(coalesce(p_mastery, '[]'::jsonb)) as m(value)
  on conflict (child_id, subject, skill)
  do update set mastery = excluded.mastery, updated_at = excluded.updated_at;

  return v_id;
end;
$$;
