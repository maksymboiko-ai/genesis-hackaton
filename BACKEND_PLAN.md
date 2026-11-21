# Backend implementation plan

Owner: Backend · Scope: `web/src/app/api/`, `web/src/lib/server/`, `supabase/` ·
Built against: `ARCHITECTURE.md`, `web/src/contracts/{api,domain,ai}.ts`,
`supabase/migrations/0001_init.sql` + `0002_book_map.sql` (state at commit `57ecd39`).

Skills to load while building: `backend-api-route`, `backend-data-access`,
`backend-security` (in `.claude/skills/`).

Deadline: **code freeze 17:50**. Live demo must work end to end before 17:00.

---

## 1. Key functionality (defined before implementation)

What the backend must do for the demo, taken from the contracts. Every item has
an ID; modules below reference them, and the status table in section 4 tracks them.

| ID | Functionality | Source |
|---|---|---|
| F1 | Create and list children; `GET /children/:id/profile` returns `LearnerProfile` (grade, notes, mastery) | api.ts, ARCH "Evolution" |
| F2 | Upload a PDF book, store it privately, respond `processing`; ingest in background with `prepareBook`; store `book.sections` + `book_chunk` rows; end in `ready` or `failed`; list/get books | api.ts, ARCH "Textbook grounding" |
| F3 | `POST /curricula`: build profile + knownSkills (+ book map), call `generateOutline`; on `questions` → respond `needs_clarification`, store nothing; on `outline` → store curriculum + lessons (`pending`, `book_section_index`), respond `created`, start first lesson in background | api.ts, ARCH "Create a curriculum" |
| F4 | `GET /curricula?childId=` and `GET /curricula/:id` with lessons by position and replan events | api.ts |
| F5 | `GET /lessons/:id`: claim `pending → generating` once, fetch section chunks (≤ `LESSON_CHUNK_LIMIT` all, else embed + `match_book_chunks` with section; remedial/extension: whole book; retry: section of original), call `generateLesson`, store, prefetch next lesson; never return `correctIndex`/`explanation` | api.ts, ARCH "Open a lesson", "Textbook grounding" |
| F6 | `POST /lessons/:id/attempts`: lesson must be `ready`; every question answered exactly once; grade in code; store attempt; mark lesson completed + `last_score`; update `skill_mastery` with `MASTERY_ALPHA`/`MASTERY_START`; return results with explanations and `nextLessonId` | api.ts, ARCH "Submit a quiz", "Evolution" |
| F7 | Replan rule after each attempt (window `REPLAN_WINDOW` since `last_replan_at`, `STRUGGLING_BELOW` / `EXCELLING_FROM`); claim `idle → running`; call `replan`; insert remedial + retry after current position (struggling) or append extensions (excelling); renumber atomically; write `replan_event`; back to `idle` | ARCH "Self-healing" |
| F8 | Refresh `child.notes` with `updateLearnerNotes` in background after each attempt | ARCH "Evolution" |
| F9 | Write every model call to `llm_call` through `onCall` | ai.ts, ARCH "Models and evals" |
| F10 | Security baseline: Zod at every edge, size caps, no injection, no answer leak, generic errors, server-only secrets, upload checks, rate limits on model routes, no PII in logs | `backend-security` skill |
| F11 | Robustness: duplicate-work claims, `failed`/`idle` reset on errors, stuck-state recovery after timeout | ARCH "Known risks" |
| F12 | Runs against a fake `AiService` now and the real one later by an env switch | ARCH "Working in parallel" |

---

## 2. Modules

Each module follows the same loop:

1. **Build**: the files listed, following the skills.
2. **Test**: unit tests for pure logic (`vitest`) and a smoke script against the local dev server with `AI_FAKE=1`.
3. **Bug re-check**: `npx tsc --noEmit`, `npm run lint`, run `/backend-security review <module files>`, fix findings, rerun tests.
4. **Compare**: tick the F-items in section 4 against what really works, and record any gaps.

A module is **Ready** only when all four steps are done.

### M0. Foundation (≈ 40 min) — F9, F10, F12

| | |
|---|---|
| Files | `lib/server/env.ts`, `db.ts`, `errors.ts`, `http.ts`, `mappers.ts`, `rate-limit.ts`, `ai.ts` (real/fake switch + `onCall → llm_call`), `ai-fake.ts`, `vitest.config.ts` |
| Deps | `@supabase/supabase-js`, `server-only`, `vitest` (dev), PDF text extractor (`unpdf`) |
| Repo | `.gitignore`: `.env*`, `!.env.example`, `TASK_CONTEXT.md`; `.env.example` with variable names only |
| DB | Supabase project, migrations `0001` + `0002` applied, private storage bucket `books` |
| Tests | `parseWith` rejects bad uuid / extra size; `route()` maps `HttpError` → envelope, unknown → generic 500; env schema fails on a missing key; fake `AiService` outputs pass the `contracts/ai.ts` schemas |
| Done when | `GET /api/health` (temporary) returns 200 using `db`; tests green |

### M1. Children and profile (≈ 25 min) — F1

| | |
|---|---|
| Routes | `POST /api/children`, `GET /api/children`, `GET /api/children/[childId]/profile` |
| Services | `lib/server/children.ts`: `createChild`, `listChildren`, `buildLearnerProfile(childId)`, `knownSkills(childId)` |
| Tests | name trimmed and capped; `gradeLevel` 0/13/"3" rejected; unknown child → 404; profile of a new child has `notes: ""`, `mastery: []` |
| Smoke | create → list → profile |

### M2. Curricula (≈ 50 min) — F3, F4

| | |
|---|---|
| Routes | `POST /api/curricula`, `GET /api/curricula?childId=`, `GET /api/curricula/[curriculumId]` |
| Services | `lib/server/curricula.ts`: `createCurriculum`, `listCurricula`, `getCurriculum`; pure `validateOutline(outline, sections)` |
| DB | migration `0003_backend_functions.sql`: `create_curriculum(...)` inserts curriculum + lessons in one transaction (contract change: separate PR, quick OK from AI and Frontend) |
| Rules | child exists; `bookId` exists and is `ready` (else 409); clarifications ≤ `MAX_CLARIFYING_QUESTIONS`, each answer capped; outline caps: 1–12 lessons, slugs match `SkillSlug`, `bookSectionIndex` in range or null; rate limit |
| Tests | `validateOutline` drops/rejects bad slugs and out-of-range sections; `needs_clarification` stores nothing; `created` response parses with `CreateCurriculumResponse` |
| Smoke | vague prompt → questions → resend with answers → created; get by id; list by child |

### M3. Lesson generation (≈ 50 min) — F5, F11

| | |
|---|---|
| Routes | `GET /api/lessons/[lessonId]` |
| Services | `lib/server/lessons.ts`: `getLesson`, `claimLesson`, `generateLessonContent`, `startNextLesson`; `lib/server/retrieval.ts`: `chunksForLesson(lesson, curriculum)` |
| DB | `0003` also adds `lesson.generation_started_at` for stuck recovery |
| Rules | conditional claim; `after()` with try/catch → `failed`; `generating` older than 3 min is re-claimable; response through `GetLessonResponse` |
| Tests | `chunksForLesson` strategy (≤ limit: all in reading order; > limit: match + sort by `chunk_index`; remedial: whole book; retry: original section; no book: `[]`); `GetLessonResponse` strips answers |
| Smoke | open lesson → `generating` → poll → `ready`; 20 parallel GETs → exactly one fake generation call |

### M4. Attempts and mastery (≈ 40 min) — F6

| | |
|---|---|
| Routes | `POST /api/lessons/[lessonId]/attempts` |
| Services | pure `grading.ts`: `gradeAttempt(content, answers)`; pure `mastery.ts`: `skillScores(results)`, `nextMastery(prev, score)`; `attempts.ts`: `submitAttempt` |
| DB | `0003`: `record_attempt(...)`: insert attempt, complete lesson, upsert mastery, in one transaction |
| Tests | all correct → 1, none → 0; unknown / duplicate / missing questionId → 400; `chosenIndex` 4 → 400; lesson not ready → 409; mastery: 0.5 → 0.65 after one correct of one, using constants |
| Smoke | answer a lesson → results with explanations, `nextLessonId` is the next position |

### M5. Replan and learner notes (≈ 50 min) — F7, F8

| | |
|---|---|
| Services | pure `replan-rule.ts`: `decideReplan(scores)`; pure `replan-plan.ts`: rows to insert (remedial after current + retry copies with original section, or extensions at the end); `replan.ts`: `runReplan(curriculumId, trigger)`; `notes.ts`: `refreshLearnerNotes(childId)` |
| DB | `0003`: `apply_replan(...)` shifts the tail, inserts lessons, writes `replan_event`, sets `last_replan_at`, sets `idle`; `curriculum.replan_started_at` for stuck recovery |
| Rules | claim `idle → running`; cap new lessons ≤ 4; failure → `idle` with no partial inserts; notes capped at 2000 chars |
| Tests | `decideReplan`: fewer than 3 → null, mean 0.59 → struggling, 0.6 → null, 0.9 → excelling; plan builder positions are contiguous and retry rows point at the right lesson; parallel triggers → one replan |
| Smoke | 3 bad attempts → `replanTriggered: "struggling"` → poll curriculum → new remedial + retry lessons + diagnosis |

### M6. Books (≈ 45 min) — F2

| | |
|---|---|
| Routes | `POST /api/books` (multipart), `GET /api/books`, `GET /api/books/[bookId]` |
| Services | `books.ts`: `uploadBook`, `ingestBook` (extract text, `prepareBook`, insert chunks in batches of 100, set `sections`, `ready`) |
| Rules | ≤ 20 MB, MIME + `%PDF-` magic, storage path `books/<uuid>.pdf`, title 1–200; limits on pages/characters/chunks; any error → `failed`; embedding length check |
| Tests | non-PDF with `.pdf` name → 415; oversize → 413; prepared book with wrong vector length → `failed` |
| Smoke | upload small PDF → `processing` → `ready`; create curriculum from it → lessons carry `bookSectionIndex` |

M6 is last of the feature modules on purpose: the demo works without a book, so a late M6 doesn't block the demo.

### M7. Hardening and integration (≈ 40 min, from 16:30) — F10, F11, F12

- Full `/backend-security review` over `app/api/` + `lib/server/` + `0003`.
- Rate limits on all model-triggering routes; daily budget guard on `llm_call`.
- Security headers + `poweredByHeader: false` in `next.config.ts` (agree with Frontend).
- `npm audit --omit=dev`.
- Switch `AI_FAKE=0` with the real `lib/ai/`; Frontend switches `api-mock.ts` → real API.
- End-to-end demo run on the deployed Vercel URL; note any change in latency.

---

## 3. Order and timeline

```
13:05 M0 ─ 13:45 M1 ─ 14:10 M2 ─ 14:30 lunch ─ 15:00 M2 (finish) ─ 15:20 M3 ─ 16:00 M4 ─ 16:30 M5 ─ 17:10 M6 ─ M7 ─ 17:50 freeze
```

If the time runs short, cut in this order: M6 (books) → stuck-state recovery → budget guard.
Never cut: validation, answer stripping, claims.

The frontend mock `web/src/lib/api-mock.ts` already implements grading, mastery and the
replan rule in memory. Use it as a behavioural reference and compare outputs in tests.

---

## 4. Planned vs actual (update after each module)

Status: ✅ ready · 🟡 in progress / partly · ❌ not started · ⚠️ ready with known gap

### Prerequisites

| Item | Status | Notes |
|---|---|---|
| Contracts `api.ts`, `domain.ts`, `ai.ts` | ✅ | by team, commit `57ecd39` (clarifications, book map, `prepareBook`) |
| DB schema `0001`, `0002` | ✅ written / ❓ applied | check that they are applied to the shared Supabase project |
| Backend skills | ✅ | `.claude/skills/backend-*` |
| Frontend mock of the API | ✅ | `web/src/lib/api-mock.ts`, by Frontend |
| Supabase project + keys + `books` bucket | ❓ | needed for M0 |
| Real `AiService` (`lib/ai/`) | ❌ | AI owner; backend uses the fake until M7 |

### Functionality

| ID | Planned | Module | Status | Actual / gaps |
|---|---|---|---|---|
| F1 | children + profile | M1 | ✅ | name trimmed, 1–100 chars, control chars stripped; profile never carries the name |
| F2 | books + ingestion | M6 | ❌ | — |
| F3 | create curriculum + clarification | M2 | ✅ | one clarification round enforced; outline bounded (≤ 12 lessons, ≤ 5 slugs each, section index checked); `create_curriculum` RPC; first-lesson kick-off lands with M3 |
| F4 | list/get curricula | M2 | ✅ | list newest first; unknown child → 404 |
| F5 | lesson generation + retrieval | M3 | ❌ | — |
| F6 | attempts, grading, mastery | M4 | ❌ | — |
| F7 | replan | M5 | ❌ | — |
| F8 | learner notes | M5 | ❌ | — |
| F9 | llm_call logging | M0 | ✅ | `lib/server/ai.ts` wraps every `AiService` call: `onCall` → `llm_call`, fire-and-forget |
| F10 | security baseline | M0–M7 | 🟡 | M0: Zod helpers, 64 KB body cap, error envelope, rate limiter, daily budget, `server-only`, env check |
| F11 | claims, failure reset, stuck recovery | M3, M5 | ❌ | — |
| F12 | fake/real AiService switch | M0, M7 | 🟡 | `AI_MODE=fake\|real`; fake done (M0), real wiring in M7 |

### Modules

| Module | Build | Tests | Bug re-check | Ready |
|---|---|---|---|---|
| M0 Foundation | ✅ | ✅ 15 tests | ✅ | ✅ |
| M1 Children | ✅ | ✅ 6 tests | ✅ | ✅ |
| M2 Curricula | ✅ | ✅ 9 tests + SQL test | ✅ | ✅ |
| M3 Lessons | ❌ | ❌ | ❌ | ❌ |
| M4 Attempts | ❌ | ❌ | ❌ | ❌ |
| M5 Replan | ❌ | ❌ | ❌ | ❌ |
| M6 Books | ❌ | ❌ | ❌ | ❌ |
| M7 Hardening | ❌ | ❌ | ❌ | ❌ |

### Review log

Append one line per module after its bug re-check: date/time, findings fixed, findings left.

| Time | Module | Fixed | Left open |
|---|---|---|---|
| 13:30 | M0 | `.env.example` was ignored by `web/.gitignore` (`.env*`) → added `!.env.example`; root `.gitignore` now ignores `.env*` and `TASK_CONTEXT.md` | Rate limits are per server instance (in memory) |
| 13:35 | M2 | Model returning questions after answers would loop → now a 502; book with a broken section map → 500 instead of a bad plan | — |
| 13:32 | M1 | Long names were silently truncated → now rejected with 400 above 100 chars | — |

---

### Deviations from the plan

- **Store layer.** Services talk to a `Store` interface (`lib/server/store/`) with two implementations: `SupabaseStore` (production) and `MemoryStore` (tests and `STORE=memory` local runs without a database). This is what makes every route testable without Supabase.
- **`vitest@3`**, not 4: vitest 4 needs `@types/node` ≥ 22 and the app pins `^20`.
- `GET /api/health` stays as a deploy check.
- **SQL tests.** `supabase/tests/0003_backend_functions.sql` checks the new functions (atomicity included) on a scratch Postgres 16 + pgvector database.

## 5. Open questions

1. Who creates the Supabase project and applies migrations? Share URL + service key via a private channel only. (Developer answer: it's done by other developer, so won't implement it)
2. `0003_backend_functions.sql` (three RPC functions + two timestamp columns) is a contract change: get a quick OK from AI and Frontend owners.
3. Will the demo be deployed publicly? If yes, add the optional `DEMO_ACCESS_TOKEN` (needs a frontend header).
4. Frontend must render `bodyMarkdown` without raw HTML.
