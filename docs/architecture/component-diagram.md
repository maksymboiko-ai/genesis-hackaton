# Component diagram

How Mendly is split into deployable parts and modules, and which way the calls go. Paths are relative to `web/src/` unless they start with `web/` or `supabase/`. For the reasoning behind the split, see [ARCHITECTURE.md](../../ARCHITECTURE.md); for the classes and interfaces inside each part, see [class-diagram.md](class-diagram.md).

## System overview

```mermaid
flowchart LR
  subgraph Browser["Browser (Frontend)"]
    direction TB
    Pages["Pages<br/>app/ (except app/api)"]
    Features["Feature screens<br/>features/*"]
    Components["Shared UI<br/>components/*"]
    FeLib["Client helpers<br/>lib/useResource, lib/session,<br/>lib/streak, lib/subjects, lib/expr"]
    ApiClient["Typed API client<br/>lib/api.ts"]
    Mock["Mock API<br/>lib/api-mock.ts"]
    Pages --> Features
    Features --> Components
    Features --> FeLib
    Features --> ApiClient
    ApiClient -. "NEXT_PUBLIC_API_MOCK" .-> Mock
  end

  subgraph Server["Next.js server on Vercel (Backend)"]
    direction TB
    Routes["Route handlers<br/>app/api/**/route.ts"]
    Http["HTTP edge<br/>lib/server/http.ts<br/>route / adminRoute / publicRoute"]
    RateLimit["Rate limiter<br/>lib/server/rate-limit.ts"]
    Auth["Auth<br/>lib/server/auth/*"]
    Services["Domain services<br/>lib/server/*.ts"]
    Bg["Background jobs<br/>lib/server/background.ts (after())"]
    AiGate["AI gateway<br/>lib/server/ai.ts<br/>budget + llm_call logging"]
    FakeAi["Fake AI<br/>lib/server/ai-fake.ts"]
    StoreMod["Data access<br/>lib/server/store/*"]
    Routes --> Http
    Http --> RateLimit
    Http --> Auth
    Routes --> Services
    Services --> Bg
    Services --> AiGate
    Services --> StoreMod
    AiGate -. "AI_MODE=fake" .-> FakeAi
  end

  subgraph AiMod["AI module (lib/ai)"]
    direction TB
    AiService["aiService<br/>lib/ai/index.ts"]
    Prompts["Prompts<br/>lib/ai/prompts.ts"]
    Blocks["Block builder<br/>lib/ai/blocks.ts"]
    Chunk["Text chunker<br/>lib/ai/chunk.ts"]
    Models["Model per task<br/>lib/ai/models.ts"]
    AiClient["OpenRouter client<br/>lib/ai/client.ts"]
    AiService --> Prompts
    AiService --> Blocks
    AiService --> Chunk
    AiService --> Models
    AiService --> AiClient
  end

  Contracts[["Shared contracts<br/>contracts/domain.ts, api.ts, ai.ts, subjects.ts"]]
  Shared[["Shared pure code<br/>lib/access.ts, lib/lesson-blocks.ts,<br/>lib/analytics.ts, lib/expr.ts"]]
  Evals["Evals<br/>web/evals/*"]

  subgraph Supabase["Supabase"]
    Pg[("Postgres + pgvector<br/>supabase/migrations")]
    Storage[("File storage<br/>uploaded PDFs")]
    SbAuth["Supabase Auth"]
  end
  OpenRouter["OpenRouter<br/>chat + embeddings"]

  ApiClient -- "HTTPS /api, JSON<br/>contracts/api.ts<br/>httpOnly session cookies" --> Routes
  ApiClient -- "PUT PDF to signed uploadUrl" --> Storage
  AiGate -- "contracts/ai.ts<br/>AiService" --> AiService
  StoreMod -- "SQL + RPC functions<br/>service role key" --> Pg
  StoreMod --> Storage
  Auth --> SbAuth
  AiClient --> OpenRouter
  Evals --> AiService

  Browser -. "types" .-> Contracts
  Server -. "types" .-> Contracts
  AiMod -. "types" .-> Contracts
  Browser -.-> Shared
  Server -.-> Shared
  AiMod -.-> Shared
```

Solid arrows are runtime calls; dotted arrows are compile-time imports or switches chosen by an environment variable.

## Backend services

The route handlers are thin: each parses its input with Zod, calls one service function and returns the result through `ok()`. The services hold the logic.

```mermaid
flowchart TB
  subgraph Routes["app/api"]
    RAuth["auth/signup, login, logout, me"]
    RChildren["children, children/:id/profile"]
    RStreak["children/:id/streak"]
    RCurricula["curricula, curricula/:id, curricula/:id/extend"]
    RLessons["lessons/:id, lessons/:id/retry"]
    RAttempts["lessons/:id/attempts"]
    RBooks["books, books/:id, books/uploads, books/uploads/:id"]
    RSub["subscription"]
    RAdmin["admin/analytics"]
    RHealth["health"]
  end

  subgraph Services["lib/server"]
    Children["children.ts<br/>children, LearnerProfile"]
    Curricula["curricula.ts<br/>create, extend, validate outline"]
    Lessons["lessons.ts<br/>claim, generate, retry"]
    Attempts["attempts.ts<br/>submit a quiz"]
    Grading["grading.ts<br/>score, mastery EMA"]
    Replan["replan.ts<br/>trigger, run, learner notes"]
    ReplanPlan["replan-plan.ts<br/>decide and plan (pure)"]
    Feedback["feedback.ts<br/>AI feedback + fallback"]
    Books["books.ts<br/>upload, ingest"]
    Pdf["pdf.ts<br/>text extraction"]
    Retrieval["retrieval.ts<br/>chunks for a lesson"]
    Streak["streak.ts<br/>activity days"]
    Subscription["subscription.ts<br/>trial, fullAccess"]
    Analytics["analytics.ts<br/>admin dashboard"]
    Access["access.ts<br/>ownership checks (404)"]
    Mappers["mappers.ts<br/>rows to contract types"]
    Timing["timing.ts<br/>lesson minutes"]
    Text["text.ts<br/>clean text, slugs"]
  end

  AiGate["ai.ts (AI gateway)"]
  Bg["background.ts"]
  Store["store (Store interface)"]
  AuthMod["auth (AuthProvider)"]

  RAuth --> AuthMod
  RChildren --> Children
  RChildren --> Access
  RStreak --> Streak
  RCurricula --> Curricula
  RLessons --> Lessons
  RAttempts --> Attempts
  RBooks --> Books
  RSub --> Subscription
  RAdmin --> Analytics
  RHealth --> Store

  Curricula --> Children
  Curricula --> Lessons
  Curricula --> Subscription
  Curricula --> Mappers
  Curricula --> Timing
  Lessons --> Retrieval
  Lessons --> Children
  Lessons --> Subscription
  Lessons --> Mappers
  Lessons --> Timing
  Attempts --> Grading
  Attempts --> Lessons
  Attempts --> Replan
  Attempts --> Feedback
  Attempts --> Streak
  Attempts --> Subscription
  Replan --> ReplanPlan
  Replan --> Lessons
  Replan --> Children
  Books --> Pdf
  Books --> Retrieval
  Access --> Store

  Curricula --> AiGate
  Lessons --> AiGate
  Replan --> AiGate
  Feedback --> AiGate
  Books --> AiGate
  Retrieval --> AiGate

  Lessons --> Bg
  Replan --> Bg
  Books --> Bg

  Services --> Store
```

`text.ts`, `errors.ts` and `env.ts` are used by almost every service and are left out of the arrows.

## Frontend screens

```mermaid
flowchart LR
  subgraph Routes["app/ pages"]
    PLogin["/login"]
    PSignup["/signup"]
    PQuiz["/quiz"]
    PApp["/app (ProductLayout)"]
    PNewChild["/app/children/new"]
    PCurr["/app/curricula/:id"]
    PLesson["/app/lessons/:id"]
    PProgress["/app/progress"]
    PStreak["/app/streak"]
    PPaywall["/paywall, /paywall/checkout, /paywall/success"]
    PAdmin["/admin"]
  end

  subgraph Features["features/"]
    FAuth["auth<br/>LoginPage, SignUpPage, AuthShell"]
    FOnb["onboarding<br/>OnboardingPage, ChildQuiz, BuildingPlan"]
    FProduct["product<br/>ProductLayout, HomePage, FirstPlan, NewPlanDialog"]
    FCurr["curriculum<br/>CurriculumPage, KeepGoing"]
    FLesson["lesson<br/>LessonPage, LessonBody, Quiz, Results,<br/>GraphBlock, NumberLineBlock, CheckBlock, StepsBlock"]
    FProgress["progress<br/>ProgressPage"]
    FStreak["streak<br/>StreakPage, StreakPill, StreakCard, StreakMoment"]
    FPaywall["paywall<br/>PaywallPage, CheckoutPage, SuccessPage"]
    FAdmin["admin<br/>AdminPage"]
  end

  Api["lib/api.ts"]

  PLogin --> FAuth
  PSignup --> FAuth
  PQuiz --> FOnb
  PNewChild --> FOnb
  PApp --> FProduct
  PCurr --> FCurr
  PLesson --> FLesson
  PProgress --> FProgress
  PStreak --> FStreak
  PPaywall --> FPaywall
  PAdmin --> FAdmin

  FLesson --> FCurr
  FLesson --> FStreak
  FProduct --> FStreak

  Features --> Api
```

## Interfaces between components

| Provider | Interface | Consumers | Implementations |
|---|---|---|---|
| Backend | HTTP API, `contracts/api.ts` | `lib/api.ts` | route handlers in `app/api/`; `lib/api-mock.ts` for frontend work without a backend |
| AI module | `AiService`, `contracts/ai.ts` | `lib/server/ai.ts` only | `aiService` (OpenRouter), `fakeAi` (canned objects) |
| Data access | `Store`, `lib/server/store/types.ts` | backend services | `SupabaseStore`, `MemoryStore` |
| Accounts | `AuthProvider`, `lib/server/auth/types.ts` | `lib/server/auth/index.ts` | `SupabaseAuth`, `MemoryAuth` |
| Database | tables and RPC functions, `supabase/migrations/` | `SupabaseStore` | Supabase Postgres |

The environment picks the implementations: `STORE=memory|supabase` chooses the store and the auth provider, `AI_MODE=fake|real` chooses the AI service, and `NEXT_PUBLIC_API_MOCK` decides whether the browser calls the real `/api`.
