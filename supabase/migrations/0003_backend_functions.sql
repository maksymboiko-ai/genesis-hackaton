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
