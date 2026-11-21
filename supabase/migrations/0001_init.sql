-- Database contract. Names and enum values mirror contracts/domain.ts.
-- All access goes through the Next.js server with the service role key;
-- the browser never talks to the database.

create extension if not exists vector;

create table child (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  grade_level int  not null check (grade_level between 1 and 12),
  -- Free-text summary of how this child learns, rewritten by the AI module.
  notes       text not null default '',
  created_at  timestamptz not null default now()
);

create table book (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  storage_path text not null,
  status       text not null default 'processing'
               check (status in ('processing', 'ready', 'failed')),
  created_at   timestamptz not null default now()
);

create table book_chunk (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references book(id) on delete cascade,
  chunk_index int  not null,
  content     text not null,
  -- Dimension must match EMBEDDING_DIMENSIONS in contracts/ai.ts.
  embedding   vector(1536) not null,
  unique (book_id, chunk_index)
);

create index book_chunk_embedding_idx
  on book_chunk using hnsw (embedding vector_cosine_ops);

create table curriculum (
  id             uuid primary key default gen_random_uuid(),
  child_id       uuid not null references child(id) on delete cascade,
  book_id        uuid references book(id) on delete set null,
  prompt         text not null,
  subject        text not null,
  title          text not null,
  replan_status  text not null default 'idle'
                 check (replan_status in ('idle', 'running')),
  -- Only attempts after this moment count towards the next replan window.
  last_replan_at timestamptz,
  created_at     timestamptz not null default now()
);

create index curriculum_child_idx on curriculum (child_id);

create table lesson (
  id                 uuid primary key default gen_random_uuid(),
  curriculum_id      uuid not null references curriculum(id) on delete cascade,
  -- Order within the curriculum. Not unique: a replan renumbers the tail
  -- inside one transaction.
  position           int  not null check (position >= 0),
  kind               text not null default 'core'
                     check (kind in ('core', 'remedial', 'retry', 'extension')),
  title              text not null,
  objective          text not null,
  skills             text[] not null default '{}',
  retry_of_lesson_id uuid references lesson(id) on delete set null,
  content_status     text not null default 'pending'
                     check (content_status in ('pending', 'generating', 'ready', 'failed')),
  -- LessonContent from contracts/domain.ts; null until content_status = 'ready'.
  content            jsonb,
  completed_at       timestamptz,
  last_score         real check (last_score between 0 and 1),
  created_at         timestamptz not null default now()
);

create index lesson_curriculum_position_idx on lesson (curriculum_id, position);

create table attempt (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references lesson(id) on delete cascade,
  score      real not null check (score between 0 and 1),
  -- QuestionResult[] from contracts/domain.ts.
  results    jsonb not null,
  created_at timestamptz not null default now()
);

create index attempt_lesson_idx on attempt (lesson_id, created_at);

create table skill_mastery (
  child_id   uuid not null references child(id) on delete cascade,
  subject    text not null,
  skill      text not null,
  mastery    real not null default 0.5 check (mastery between 0 and 1),
  updated_at timestamptz not null default now(),
  primary key (child_id, subject, skill)
);

create table replan_event (
  id                  uuid primary key default gen_random_uuid(),
  curriculum_id       uuid not null references curriculum(id) on delete cascade,
  trigger             text not null check (trigger in ('struggling', 'excelling')),
  -- ReplanDiagnosis from contracts/domain.ts.
  diagnosis           jsonb not null,
  inserted_lesson_ids uuid[] not null default '{}',
  created_at          timestamptz not null default now()
);

create index replan_event_curriculum_idx on replan_event (curriculum_id, created_at);

-- One row per model call: LlmCallRecord from contracts/ai.ts, written by the
-- backend. Lets production traffic be compared across models like an eval.
create table llm_call (
  id            uuid primary key default gen_random_uuid(),
  task          text not null,
  model         text not null,
  latency_ms    int  not null,
  input_tokens  int,
  output_tokens int,
  ok            boolean not null,
  created_at    timestamptz not null default now()
);

-- Nearest chunks of one book to a query embedding, by cosine distance.
create function match_book_chunks(
  p_book_id   uuid,
  p_embedding vector(1536),
  p_limit     int default 6
)
returns table (content text, similarity real)
language sql stable
as $$
  select c.content,
         (1 - (c.embedding <=> p_embedding))::real as similarity
  from book_chunk c
  where c.book_id = p_book_id
  order by c.embedding <=> p_embedding
  limit p_limit;
$$;
