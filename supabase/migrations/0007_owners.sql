-- Real accounts (ADR 0004). Each child and book belongs to one parent: an
-- auth.users row from Supabase Auth. Curricula, lessons and attempts belong
-- to the parent through the child. The backend checks ownership on every
-- request; RLS stays deny-all for client roles (0005).

alter table child
  add column owner_id uuid references auth.users(id) on delete cascade;
alter table book
  add column owner_id uuid references auth.users(id) on delete cascade;

-- Rows created before accounts existed have no owner and are invisible to
-- every parent.
create index child_owner_idx on child (owner_id, created_at);
create index book_owner_idx on book (owner_id, created_at);
