-- LessonSummary.estimatedMinutes: how long a lesson takes, reading and quiz
-- together. The model's estimate from the outline until the content is
-- ready; then the backend computes it from the content.
alter table lesson
  add column estimated_minutes int not null default 10
  check (estimated_minutes between 1 and 60);
-- The default only fills rows that existed before this migration; every new
-- lesson must come with its own estimate.
alter table lesson alter column estimated_minutes drop default;

-- The write functions now store the estimate. Lesson jsonb gains
-- estimated_minutes; CREATE OR REPLACE keeps the grants from 0005.
create or replace function create_curriculum(
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

  insert into lesson (curriculum_id, position, kind, title, objective, skills, book_section_index, estimated_minutes)
  select v_id,
         (l.ord - 1)::int,
         'core',
         l.value->>'title',
         l.value->>'objective',
         coalesce(array(select jsonb_array_elements_text(l.value->'skills')), '{}'),
         (l.value->>'book_section_index')::int,
         (l.value->>'estimated_minutes')::int
  from jsonb_array_elements(p_lessons) with ordinality as l(value, ord);

  return v_id;
end;
$$;

create or replace function apply_replan(
  p_curriculum_id uuid,
  p_insert_at     int,
  p_lessons       jsonb,
  p_trigger       text,
  p_diagnosis     jsonb
)
returns uuid[]
language plpgsql
as $$
declare
  v_lessons jsonb := coalesce(p_lessons, '[]'::jsonb);
  v_n int;
  v_ids uuid[];
begin
  if jsonb_typeof(v_lessons) <> 'array' then
    raise exception 'p_lessons must be an array';
  end if;
  v_n := jsonb_array_length(v_lessons);

  -- Serializes replans of one curriculum.
  perform 1 from curriculum where id = p_curriculum_id for update;
  if not found then
    raise exception 'curriculum % not found', p_curriculum_id;
  end if;

  update lesson
     set position = position + v_n
   where curriculum_id = p_curriculum_id
     and position >= p_insert_at;

  with inserted as (
    insert into lesson (curriculum_id, position, kind, title, objective, skills, retry_of_lesson_id,
                        book_section_index, reason, estimated_minutes)
    select p_curriculum_id,
           p_insert_at + (l.ord - 1)::int,
           l.value->>'kind',
           l.value->>'title',
           l.value->>'objective',
           coalesce(array(select jsonb_array_elements_text(l.value->'skills')), '{}'),
           (l.value->>'retry_of_lesson_id')::uuid,
           (l.value->>'book_section_index')::int,
           l.value->>'reason',
           (l.value->>'estimated_minutes')::int
    from jsonb_array_elements(v_lessons) with ordinality as l(value, ord)
    returning id, position
  )
  select coalesce(array_agg(id order by position), '{}') into v_ids from inserted;

  insert into replan_event (curriculum_id, trigger, diagnosis, inserted_lesson_ids)
  values (p_curriculum_id, p_trigger, p_diagnosis, v_ids);

  update curriculum
     set last_replan_at = now(),
         replan_status = 'idle',
         replan_started_at = null
   where id = p_curriculum_id;

  return v_ids;
end;
$$;
