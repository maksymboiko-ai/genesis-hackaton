---
name: backend-api-route
description: Build or change a Next.js route handler under web/src/app/api/ for this project. Use whenever adding an endpoint, wiring a route to lib/server services, returning errors, or starting background work with after(). Contract-first: every route validates against web/src/contracts/api.ts.
argument-hint: "<endpoint, e.g. POST /api/lessons/:id/attempts>"
---

# /backend-api-route

Build one endpoint the way every endpoint in this repo is built. Read
`ARCHITECTURE.md` (flows, ownership) and the three contracts before writing code:
`web/src/contracts/api.ts`, `web/src/contracts/domain.ts`, `web/src/contracts/ai.ts`.

> This Next.js version (16.x) may differ from what you remember. Before using an
> API you are unsure of (`after`, route `params`, `headers`), check
> `web/node_modules/next/dist/docs/` as `web/AGENTS.md` requires.

Security rules for every route live in the `backend-security` skill. Database
access patterns live in `backend-data-access`. Load both when the route touches
input or data — which is always.

## Ownership (do not cross)

| Backend owns | Backend never touches |
|---|---|
| `web/src/app/api/**`, `web/src/lib/server/**`, `supabase/**` | prompts, model choice, `lib/ai/**`, frontend `app/` pages, `features/`, `components/` |

- Need a field that is not in a contract? Stop and change the contract in a
  separate PR first (see "Changing a contract" in ARCHITECTURE.md).
- Never redeclare `Lesson`, `Question`, etc. Import from `@/contracts/*`.
- Never write a prompt or parse raw model text. Call `AiService` and get typed objects.
- **Code decides when, models decide what.** Grading, replan trigger, ordering,
  mastery arithmetic are plain code in `lib/server/`.

## Layering

```
app/api/<resource>/route.ts      thin: parse → call service → serialize
lib/server/http.ts               route() wrapper, ApiError mapping, body limits
lib/server/errors.ts             NotFound / Conflict / BadRequest classes
lib/server/<domain>.ts           business logic (curriculum, grading, replan, mastery, books)
lib/server/db.ts                 the one Supabase service-role client (server-only)
lib/server/ai.ts                 picks real AiService or the fake; onCall → llm_call
```

A route file holds no business logic and no SQL. If it is longer than ~30
lines, move logic into `lib/server/`.

## Steps

1. **Find the contract.** Locate the request/response schemas for the endpoint
   in `api.ts`. If missing → contract PR first.
2. **Write the service function** in `lib/server/<domain>.ts`. It takes already
   validated, typed input and returns a contract-typed object. It throws
   `NotFound` / `Conflict` / `BadRequest` from `lib/server/errors.ts`.
3. **Write the route** with the `route()` wrapper (template in
   `references/route-template.md`):
   - Validate path params with `Id` (uuid) from `@/contracts/domain`.
   - Validate query strings and bodies with the contract schema (`safeParse`).
   - Use only the parsed result. Never spread the raw body into a DB insert.
   - Parse the response through the response schema before returning
     (`CreateChildResponse.parse(result)`). This is what guarantees
     `correctIndex`/`explanation` never leak and catches mapping bugs.
4. **Errors** always use the envelope from `api.ts`:
   `{ error: { code: "bad_request" | "not_found" | "conflict" | "internal", message } }`
   with status 400 / 404 / 409 / 500. 500 messages are generic; details go to
   the server log only.
5. **Background work** (lesson generation, replan, book ingestion, learner
   notes) uses `after()` from `next/server`. Rules:
   - Respond first; never await model calls the contract says happen in the background.
   - Claim before working: conditional update (`pending → generating`,
     `idle → running`) and proceed only if a row changed. See `backend-data-access`.
   - Wrap the job in try/catch; on failure set the status to `failed`/`idle`
     so the UI never polls forever.
6. **Dynamic params** in Next 15+ are a Promise:
   `export async function GET(req: Request, ctx: { params: Promise<{ lessonId: string }> })`.
7. **Check** with the "Done when" list below.

## Endpoint notes (from the contract)

| Endpoint | Must do |
|---|---|
| `POST /children` | `CreateChildRequest` → insert → `Child` |
| `GET /children/:childId/profile` | build `LearnerProfile` from `child.notes` + `skill_mastery` |
| `POST /books` | multipart; validate PDF (see security skill), store, respond `processing`, ingest in `after()` |
| `POST /curricula` | outline is generated **before** responding; validate `bookId` exists and is `ready`; first lesson in `after()` |
| `GET /curricula/:id` | lessons ordered by `position`; replan events by `created_at` |
| `GET /lessons/:id` | if `pending` → claim + generate in `after()`; response through `GetLessonResponse` (no answers) |
| `POST /lessons/:id/attempts` | lesson must be `ready` (else 409); every question answered exactly once; grade in code; update mastery; apply replan rule; respond immediately |

Replan rule and mastery formula: use the constants from `domain.ts`
(`REPLAN_WINDOW`, `STRUGGLING_BELOW`, `EXCELLING_FROM`, `MASTERY_ALPHA`,
`MASTERY_START`). Never hard-code 3 / 0.6 / 0.9 / 0.3 / 0.5.

## Working without the AI module

Until `lib/ai/` is ready, `lib/server/ai.ts` returns a fake `AiService` that
returns canned objects satisfying `contracts/ai.ts`. Switch with an env flag
(`AI_FAKE=1`). The fake must also pass the same Zod schemas, so integration is
a swap, not a rewrite.

## Done when

- [ ] Route file only parses, calls a service, serializes
- [ ] Every input (params, query, body, form fields) validated with Zod; only parsed data used
- [ ] Response parsed through the contract response schema
- [ ] All errors use the `ApiError` envelope with the right status; no stack traces in responses
- [ ] Background work claims its row and resets status on failure
- [ ] No prompt text, no raw model parsing, no locally redeclared contract types
- [ ] `backend-security` checklist passes for this route
- [ ] `npm run lint` and `npx tsc --noEmit` pass in `web/`
