-- Tests for 0006_estimated_minutes.sql.
begin;

do $$
declare
  v_child uuid;
  v_cur uuid;
  v_ids uuid[];
begin
  insert into child (name, grade_level) values ('T', 5) returning id into v_child;
  v_cur := create_curriculum(v_child, null, 'p', 'math', 'T',
    '[{"title":"A","objective":"a","skills":["s"],"estimated_minutes":7}]'::jsonb);
  if (select estimated_minutes from lesson where curriculum_id = v_cur) <> 7 then
    raise exception 'create_curriculum: estimate not stored';
  end if;

  -- A lesson without an estimate is refused (no default).
  begin
    perform create_curriculum(v_child, null, 'p', 'math', 'T', '[{"title":"A","objective":"a","skills":["s"]}]'::jsonb);
    raise exception 'create_curriculum: accepted a lesson without estimated_minutes';
  exception when not_null_violation then null;
  end;
  -- Out of range is refused.
  begin
    perform create_curriculum(v_child, null, 'p', 'math', 'T', '[{"title":"A","objective":"a","skills":["s"],"estimated_minutes":0}]'::jsonb);
    raise exception 'create_curriculum: accepted estimated_minutes 0';
  exception when check_violation then null;
  end;

  perform claim_replan(v_cur, now());
  v_ids := apply_replan(v_cur, 1,
    '[{"kind":"extension","title":"E","objective":"e","skills":["x"],"reason":"r","estimated_minutes":12}]'::jsonb,
    'excelling', '{"summary":"s","childMessage":"c","mistakes":[],"missingSkills":[]}'::jsonb);
  if (select estimated_minutes from lesson where id = v_ids[1]) <> 12 then
    raise exception 'apply_replan: estimate not stored';
  end if;
  raise notice 'estimated_minutes: ok';
end $$;

rollback;
