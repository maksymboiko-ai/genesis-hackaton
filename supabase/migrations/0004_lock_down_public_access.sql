-- Deny-by-default for Supabase's client roles. The app only reaches the
-- database from the server with the service role key, which bypasses RLS, so
-- this changes nothing for the backend. It stops anyone holding the project's
-- anon key from reading children's data or calling the write functions
-- through the auto-generated REST API.

-- RLS on, no policies: anon and authenticated see no rows and write nothing.
alter table child         enable row level security;
alter table book          enable row level security;
alter table book_chunk    enable row level security;
alter table curriculum    enable row level security;
alter table lesson        enable row level security;
alter table attempt       enable row level security;
alter table skill_mastery enable row level security;
alter table replan_event  enable row level security;
alter table llm_call      enable row level security;

-- Functions are executable by PUBLIC by default; keep them server-only.
revoke execute on function
  create_curriculum(uuid, uuid, text, text, text, jsonb),
  claim_lesson(uuid, timestamptz, timestamptz),
  record_attempt(uuid, real, jsonb, uuid, text, jsonb),
  claim_replan(uuid, timestamptz),
  apply_replan(uuid, int, jsonb, text, jsonb),
  match_book_chunks(uuid, vector, int, int)
from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function
      create_curriculum(uuid, uuid, text, text, text, jsonb),
      claim_lesson(uuid, timestamptz, timestamptz),
      record_attempt(uuid, real, jsonb, uuid, text, jsonb),
      claim_replan(uuid, timestamptz),
      apply_replan(uuid, int, jsonb, text, jsonb),
      match_book_chunks(uuid, vector, int, int)
    to service_role';
  end if;
end $$;
