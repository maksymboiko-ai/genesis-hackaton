---
name: backend-data-access
description: Read and write the Supabase database from web/src/lib/server/ — the service-role client, row↔contract mapping, conditional-update claims, transactions through Postgres functions, new migrations, stuck-state recovery, llm_call logging, pgvector retrieval. Use when writing any database code or schema change for this project.
argument-hint: "<table, flow or migration>"
---

# /backend-data-access

The database contract is `supabase/migrations/0001_init.sql`. Column and enum
names mirror `web/src/contracts/domain.ts`. All access is server-side with the
service role key (no RLS in the MVP), so every query is trusted — which is why
`backend-security` rules apply to every value you pass in.

## The client

`web/src/lib/server/db.ts` — one client, server-only:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
```

Rules:
- Only `lib/server/**` imports `db`. Never the frontend, never `lib/ai/**`.
- Always check `{ data, error }`; throw on `error`. Map not-found to `notFound()`.
- Select explicit columns, not `*`, for anything returned to the client.

## Row ↔ contract mapping

DB is `snake_case`, contracts are `camelCase`. Keep one mapper per entity in
`lib/server/mappers.ts`, and **parse jsonb columns with their contract schema**
when reading — jsonb is untyped and may hold model output:

```ts
export const toLessonSummary = (r: LessonRow): LessonSummary => ({
  id: r.id, curriculumId: r.curriculum_id, position: r.position, kind: r.kind,
  title: r.title, objective: r.objective, skills: r.skills,
  retryOfLessonId: r.retry_of_lesson_id, contentStatus: r.content_status,
  completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
  lastScore: r.last_score,
});
const content = LessonContent.parse(row.content);      // lesson.content
const results = z.array(QuestionResult).parse(row.results); // attempt.results
const diagnosis = ReplanDiagnosis.parse(row.diagnosis);    // replan_event.diagnosis
```

Timestamps: contracts use `z.string().datetime()` (ISO with `Z`); Postgres
returns `+00:00` — normalize with `new Date(x).toISOString()`.

## Claims (no duplicate work)

Before any background generation, claim the row with a conditional update and
continue only if a row came back:

```ts
const { data } = await db
  .from("lesson")
  .update({ content_status: "generating" })
  .eq("id", lessonId)
  .eq("content_status", "pending")
  .select("id")
  .maybeSingle();
if (!data) return; // someone else claimed it
```

Same for replans: `curriculum.replan_status` `idle → running`.
On failure: lesson → `failed`, curriculum → `idle`. Always, in `catch`.

## Transactions

supabase-js has no client-side transactions. Anything multi-step that must be
atomic is a **Postgres function** called with `.rpc()`:

- `apply_replan(p_curriculum_id, p_after_position, p_lessons jsonb, p_trigger, p_diagnosis jsonb)`
  — shifts positions of the tail, inserts remedial/retry/extension lessons,
  writes `replan_event`, sets `last_replan_at`, returns `replan_status` to `idle`.
- `record_attempt(...)` — insert attempt, mark lesson completed + `last_score`,
  upsert `skill_mastery` rows.

Write these in `language sql` or `plpgsql` without dynamic SQL. Parameters only.

## Mastery

```
mastery = (1 - MASTERY_ALPHA) * mastery + MASTERY_ALPHA * skillScore
```

Missing row → start from `MASTERY_START`. Upsert on `(child_id, subject, skill)`.
Compute in TypeScript with the constants from `domain.ts` (or pass them into
the SQL function as parameters — never hard-code).

## Replan window

Attempts for lessons of this curriculum with `created_at > last_replan_at`
(or all, if null), newest first, take `REPLAN_WINDOW`. Only when the count
reaches `REPLAN_WINDOW` compare the mean to `STRUGGLING_BELOW` / `EXCELLING_FROM`.

## Retrieval (pgvector)

```ts
if (embedding.length !== EMBEDDING_DIMENSIONS || !embedding.every(Number.isFinite)) {
  throw new Error("Bad embedding");
}
const { data, error } = await db.rpc("match_book_chunks", {
  p_book_id: bookId,
  p_embedding: embedding,
  p_limit: Math.min(limit, 10),
});
```

Only query books with `status = 'ready'`. Insert chunks in batches (e.g. 100).

## Stuck states

A job killed by the function timeout leaves `generating` / `running` forever.
The schema has no "started at" column, so recovery needs a **new migration**
(e.g. `0002_job_timestamps.sql` adding `lesson.generation_started_at`,
`curriculum.replan_started_at`). Treat rows older than ~3 minutes in those
states as failed and re-claimable. Until then: reset on failure in `catch`.

## llm_call logging

`lib/server/ai.ts` passes `onCall` to every `AiService` call and inserts the
record into `llm_call` (task, model, latency_ms, tokens, ok). Fire-and-forget,
never block the response, never store prompt or output text.

## Migrations

- `0001_init.sql` is never edited once applied. Every change is a new file
  `supabase/migrations/000N_<what>.sql`.
- A migration is a contract change → its own PR, approved by whoever is on the
  other side of the boundary (ARCHITECTURE.md "Changing a contract").
- Add `check` constraints for every enum and range, matching `domain.ts`.
- New tables: uuid primary keys (`gen_random_uuid()`), `created_at timestamptz default now()`,
  FK with explicit `on delete` behaviour, an index for every FK you filter on.

## Done when

- [ ] Only `lib/server/**` touches `db`; file starts with `import "server-only"`
- [ ] Every `{ error }` checked; not-found mapped to 404
- [ ] jsonb parsed with contract schemas on read; responses built via mappers
- [ ] Background work claims with conditional updates and resets on failure
- [ ] Multi-step writes go through one Postgres function
- [ ] Constants from `domain.ts`, not literals
- [ ] Schema changes are new migration files in a separate PR
