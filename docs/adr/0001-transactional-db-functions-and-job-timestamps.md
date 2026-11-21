# ADR 0001: Transactional database functions and job timestamps

- **Status:** Proposed. Needs OK from AI and Frontend owners (contract change, see ARCHITECTURE.md "Changing a contract")
- **Date:** 2026-11-21
- **Owner:** Backend
- **Affects:** `supabase/migrations/0003_backend_functions.sql`, `web/src/lib/server/`

## Context

1. Three backend flows write to several tables at once:
   - create a curriculum: `curriculum` + all its `lesson` rows;
   - record an attempt: `attempt` + `lesson.completed_at`/`last_score` + `skill_mastery` upserts;
   - apply a replan: shift `lesson.position` of the tail + insert remedial/retry/extension lessons + `replan_event` + `curriculum.last_replan_at`/`replan_status`.

   supabase-js has no client-side transactions. A failure mid-way leaves
   half-written data: a curriculum without lessons, an attempt without mastery,
   or a renumbered curriculum with missing lessons.

2. Lesson generation and replans run in the background with Next.js `after()`,
   bounded by the Vercel function's maximum duration. A killed job leaves the
   row in `content_status = 'generating'` or `replan_status = 'running'` forever,
   and the UI polls without end (ARCHITECTURE.md "Known risks: Stuck states").
   The current schema has no column that says when the job started.

## Decision

Add migration `0003_backend_functions.sql` (new file; `0001`/`0002` stay unchanged):

- **Three Postgres functions**, called with `db.rpc(...)`, each one transaction:
  - `create_curriculum(...)`: inserts the curriculum and its lessons, returns the ids;
  - `record_attempt(...)`: inserts the attempt, completes the lesson, upserts mastery;
  - `apply_replan(...)`: shifts positions, inserts lessons, writes `replan_event`,
    sets `last_replan_at` and `replan_status = 'idle'`.

  Plain parameters only, no dynamic SQL. Business rules (grading, mastery
  formula, replan rule) stay in TypeScript; the functions only write.

- **Two timestamp columns:**
  - `lesson.generation_started_at timestamptz`: set when a lesson is claimed (`pending → generating`);
  - `curriculum.replan_started_at timestamptz`: set when a replan is claimed (`idle → running`).

  A row older than 3 minutes in `generating`/`running` counts as failed and can be claimed again.

## Consequences

- ✅ Writes are all or nothing; no partial curricula, attempts or replans.
- ✅ A dead background job recovers on the next request instead of blocking the curriculum.
- ✅ No change to `contracts/api.ts`: Frontend code is unaffected.
- ✅ No change to `contracts/ai.ts`: the AI module is unaffected.
- ⚠️ Some write logic lives in SQL; it must be reviewed together with the TypeScript that calls it.
- ⚠️ The migration must be applied to the shared Supabase project before backend modules M2–M5 are deployed.
