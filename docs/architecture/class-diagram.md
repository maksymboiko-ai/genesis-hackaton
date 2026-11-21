# Class diagrams

The code is TypeScript with few classes: most types are Zod schemas, and most backend logic lives in modules of plain functions. The diagrams therefore show three kinds of box:

- `<<interface>>`: a TypeScript interface with more than one implementation (a port).
- `<<module>>`: a file of exported functions, drawn as a class whose methods are those functions.
- plain boxes: data shapes from `contracts/` and `lib/server/store/types.ts`, or real `class`es.

Paths are relative to `web/src/`. See [component-diagram.md](component-diagram.md) for how the parts fit together.

## 1. Domain model

The entities of `contracts/domain.ts` and the tables of `supabase/migrations/` they are stored in. Multiplicities follow the foreign keys.

```mermaid
classDiagram
  direction LR

  class Parent {
    <<AuthUser>>
    +id: uuid
    +email: string
    +name: string
  }
  class Child {
    <<table child>>
    +id: uuid
    +ownerId: uuid
    +name: string
    +gradeLevel: 1..12
    +notes: string
  }
  class SkillMastery {
    <<table skill_mastery>>
    +childId: uuid
    +subject: string
    +skill: SkillSlug
    +mastery: 0..1
  }
  class LearnerProfile {
    <<value>>
    +gradeLevel: number
    +notes: string
    +mastery: SkillMastery[]
  }
  class ActivityDay {
    <<table child_activity_day>>
    +childId: uuid
    +day: YYYY-MM-DD
  }
  class Curriculum {
    <<table curriculum>>
    +id: uuid
    +childId: uuid
    +bookId: uuid?
    +prompt: string
    +subject: string
    +title: string
    +replanStatus: ReplanStatus
    +lastReplanAt: datetime?
  }
  class Lesson {
    <<table lesson>>
    +id: uuid
    +curriculumId: uuid
    +position: int
    +kind: LessonKind
    +title: string
    +objective: string
    +skills: SkillSlug[]
    +retryOfLessonId: uuid?
    +reason: string?
    +estimatedMinutes: 1..60
    +contentStatus: ContentStatus
    +content: LessonContent?
    +completedAt: datetime?
    +lastScore: 0..1?
    +bookSectionIndex: int?
  }
  class LessonContent {
    <<jsonb>>
    +bodyMarkdown: string
    +blocks: LessonBlock[]
    +questions: Question[]
  }
  class Question {
    +id: string
    +prompt: string
    +choices: string[4]
    +correctIndex: 0..3
    +explanation: string
    +choiceFeedback: string[4]
    +skill: SkillSlug
  }
  class LessonBlock {
    <<union by type>>
    +id: BlockId
    +type: graph, number_line, check or steps
  }
  class GraphBlock {
    +parameters: GraphParameter[]
    +elements: GraphElement[]
    +readouts
  }
  class NumberLineBlock {
    +points
    +ranges
  }
  class CheckBlock {
    +prompt: string
    +choices
    +feedback per choice
  }
  class StepsBlock {
    +steps
  }
  class Attempt {
    <<table attempt>>
    +id: uuid
    +lessonId: uuid
    +score: 0..1
    +results: QuestionResult[]
    +createdAt: datetime
  }
  class QuestionResult {
    +questionId: string
    +skill: SkillSlug
    +chosenIndex: 0..3
    +correctIndex: 0..3
    +correct: boolean
    +explanation: string
  }
  class ReplanEvent {
    <<table replan_event>>
    +id: uuid
    +curriculumId: uuid
    +trigger: ReplanTrigger
    +diagnosis: ReplanDiagnosis
    +insertedLessonIds: uuid[]
    +createdAt: datetime
  }
  class ReplanDiagnosis {
    <<jsonb>>
    +summary: string
    +childMessage: string
    +mistakes: string[]
    +missingSkills: SkillSlug[]
  }
  class Book {
    <<table book>>
    +id: uuid
    +ownerId: uuid
    +title: string
    +storagePath: string
    +status: BookStatus
    +sections: BookSection[]
  }
  class BookSection {
    <<jsonb>>
    +index: int
    +chapter: string
    +title: string
    +summary: string
  }
  class BookChunk {
    <<table book_chunk>>
    +bookId: uuid
    +chunkIndex: int
    +sectionIndex: int
    +content: string
    +embedding: vector 1536
  }
  class Subscription {
    <<table subscription>>
    +ownerId: uuid
    +plan: BillingPlan
    +trialStartedAt: datetime
    +trialEndsAt: datetime
    +paidAt: datetime?
  }
  class LlmCall {
    <<table llm_call>>
    +task: string
    +model: string
    +latencyMs: int
    +inputTokens: int?
    +outputTokens: int?
    +ok: boolean
  }

  class LessonKind {
    <<enumeration>>
    core
    remedial
    retry
    extension
  }
  class ContentStatus {
    <<enumeration>>
    pending
    generating
    ready
    failed
  }
  class ReplanStatus {
    <<enumeration>>
    idle
    running
  }
  class ReplanTrigger {
    <<enumeration>>
    struggling
    excelling
  }
  class BookStatus {
    <<enumeration>>
    processing
    ready
    failed
  }
  class BillingPlan {
    <<enumeration>>
    yearly
    monthly
  }

  Parent "1" --> "0..*" Child : owns
  Parent "1" --> "0..*" Book : uploads
  Parent "1" --> "0..1" Subscription : has
  Child "1" *-- "0..*" SkillMastery
  Child "1" *-- "0..*" ActivityDay
  Child "1" *-- "0..*" Curriculum
  Curriculum "0..*" --> "0..1" Book : grounded in
  Curriculum "1" *-- "1..*" Lesson : ordered by position
  Curriculum "1" *-- "0..*" ReplanEvent
  Lesson "0..*" --> "0..1" Lesson : retryOf
  Lesson "1" *-- "0..1" LessonContent
  Lesson "1" *-- "0..*" Attempt
  LessonContent "1" *-- "1..*" Question
  LessonContent "1" *-- "0..10" LessonBlock
  LessonBlock <|-- GraphBlock
  LessonBlock <|-- NumberLineBlock
  LessonBlock <|-- CheckBlock
  LessonBlock <|-- StepsBlock
  Attempt "1" *-- "1..*" QuestionResult
  ReplanEvent "1" *-- "1" ReplanDiagnosis
  ReplanEvent "1" --> "1..*" Lesson : inserted
  Book "1" *-- "0..*" BookSection
  Book "1" *-- "0..*" BookChunk
  BookChunk "0..*" --> "1" BookSection : sectionIndex
  Lesson "0..*" --> "0..1" BookSection : bookSectionIndex
  LearnerProfile ..> Child : built from notes
  LearnerProfile ..> SkillMastery : built from

  Lesson --> LessonKind
  Lesson --> ContentStatus
  Curriculum --> ReplanStatus
  ReplanEvent --> ReplanTrigger
  Book --> BookStatus
  Subscription --> BillingPlan
```

Skills are the common key: a `Lesson` lists the skills it teaches, each `Question` names one, `QuestionResult` carries it into the attempt, and `SkillMastery` is updated per skill.

## 2. Ports and adapters (backend)

The three interfaces the backend depends on, their implementations, and the factories that choose one from the environment.

```mermaid
classDiagram
  direction TB

  class Store {
    <<interface>>
    +ping() Promise~void~
    +createChild(input) Promise~ChildRow~
    +listChildren(ownerId) Promise~ChildRow[]~
    +getChild(id) Promise~ChildRow~
    +updateChildNotes(id, notes) Promise~void~
    +listMastery(childId) Promise~MasteryRow[]~
    +createBook(input) Promise~BookRow~
    +getBook(id) / listBooks(ownerId)
    +completeBook(id, sections, chunks) Promise~void~
    +failBook(id) Promise~void~
    +createUploadUrl(path) Promise~string~
    +uploadFile / fileSize / downloadFile / removeFile
    +createCurriculum(input) Promise~string~
    +appendLessons(curriculumId, lessons) Promise~string[]~
    +listCurricula(childId) / getCurriculum(id)
    +listLessons(curriculumId) / getLesson(id)
    +listReplanEvents(curriculumId)
    +claimLesson(id, staleBefore, retryBefore) Promise~boolean~
    +saveLessonContent(id, content, minutes) Promise~void~
    +failLesson(id) Promise~void~
    +recordAttempt(input) Promise~string~
    +listCurriculumAttempts(curriculumId, since, limit)
    +listChildAttempts(childId, limit)
    +addActivityDay(childId, day) / listActivityDays(childId, limit)
    +claimReplan(curriculumId, staleBefore) Promise~boolean~
    +applyReplan(input) Promise~string[]~
    +releaseReplan(curriculumId) Promise~void~
    +countChunks / listChunks / matchChunks
    +insertLlmCall(record) / countLlmCallsSince(since)
    +getSubscription(ownerId) / startTrial(input)
    +analyticsRows(llmSince) Promise~AnalyticsRows~
  }
  class SupabaseStore {
    -client: SupabaseClient
    -bucket: string
    +constructor(url, serviceRoleKey, bucket)
  }
  class MemoryStore {
    -maps of rows
  }
  Store <|.. SupabaseStore
  Store <|.. MemoryStore

  class StoreFactory {
    <<module store/index.ts>>
    +getStore() Store
    +setStoreForTests(store)
  }
  StoreFactory ..> SupabaseStore : STORE=supabase
  StoreFactory ..> MemoryStore : STORE=memory

  class AuthProvider {
    <<interface>>
    +signUp(name, email, password) Promise~UserAndSession~
    +signIn(email, password) Promise~UserAndSession~
    +getUser(accessToken) Promise~AuthUser~
    +refresh(refreshToken) Promise~UserAndSession~
    +signOut(accessToken) Promise~void~
  }
  class SupabaseAuth {
    +constructor(url, serviceRoleKey)
  }
  class MemoryAuth
  AuthProvider <|.. SupabaseAuth
  AuthProvider <|.. MemoryAuth

  class AuthModule {
    <<module auth/index.ts>>
    +getAuth() AuthProvider
    +authenticate(req) Promise~UserAndCookies~
    +sessionCookies(req, session) string[]
    +clearedCookies(req) string[]
    +readCookie(req, name) string
    +forgetToken(accessToken)
    -cache: Map token to user, 60 s
  }
  AuthModule ..> SupabaseAuth : STORE=supabase
  AuthModule ..> MemoryAuth : STORE=memory
  AuthModule --> AuthProvider

  class AiService {
    <<interface contracts/ai.ts>>
    +generateOutline(input, options) Promise~OutlineResult~
    +extendOutline(input, options) Promise~OutlineLessons~
    +generateLesson(input, options) Promise~LessonContent~
    +replan(input, options) Promise~DiagnosisAndLessons~
    +updateLearnerNotes(input, options) Promise~LearnerNotesOutput~
    +writeAttemptFeedback(input, options) Promise~AttemptFeedbackOutput~
    +prepareBook(input, options) Promise~PreparedBook~
    +embed(texts, options) Promise~number[][]~
  }
  class aiService {
    <<object lib/ai/index.ts>>
    OpenRouter models
  }
  class fakeAi {
    <<object lib/server/ai-fake.ts>>
    canned outputs, fakeEmbedding
  }
  class AiGateway {
    <<module lib/server/ai.ts>>
    +getAi() AiService
    +assertBudget() Promise~void~
    -wrap(name) budget check, llm_call log, error to 502
  }
  AiService <|.. aiService
  AiService <|.. fakeAi
  AiGateway ..|> AiService : returns a wrapped one
  AiGateway ..> aiService : AI_MODE=real
  AiGateway ..> fakeAi : AI_MODE=fake
  AiGateway --> Store : insertLlmCall, countLlmCallsSince

  class Env {
    <<module env.ts>>
    +getEnv() Env
    STORE, AI_MODE, SUPABASE_*, OPENROUTER_API_KEY
    DAILY_LLM_CALL_LIMIT, ADMIN_EMAILS
  }
  StoreFactory --> Env
  AuthModule --> Env
  AiGateway --> Env
```

All three factories keep one instance on `globalThis`, so dev hot reload keeps the in-memory data, and each has a `set...ForTests` hook.

## 3. Backend service modules

What each `lib/server` module exports and what it calls. Route handlers in `app/api/` call only the top row.

```mermaid
classDiagram
  direction TB

  class Http {
    <<module http.ts>>
    +route(handler, options) Handler
    +adminRoute(handler, options) Handler
    +publicRoute(handler, options) Handler
    +parseJson(req, schema)
    +parseWith(schema, value)
    +ok(schema, data, status) Response
    +errorResponse(err, req) Response
    -assertSameOrigin(req)
  }
  class RateLimit {
    <<module rate-limit.ts>>
    +LIMITS
    +rateLimit(key, rule)
  }
  Http --> RateLimit
  Http --> AuthModule

  class AuthModule {
    <<module auth/index.ts>>
    +authenticate(req)
  }

  class Curricula {
    <<module curricula.ts>>
    +createCurriculum(user, body) CreateCurriculumResponse
    +extendCurriculum(user, id) Curriculum
    +listCurricula(user, childId)
    +getOwnedCurriculum(user, id) Curriculum
    +validateOutline(outline, ...) ValidOutline
  }
  class Lessons {
    <<module lessons.ts>>
    +getLesson(user, lessonId) GetLessonResponse
    +retryLesson(user, lessonId) GetLessonResponse
    +startLessonGeneration(lessonId, retryNow) boolean
    +generateLessonContent(lessonId)
    +claimLessonForGeneration(id) boolean
    +checkLessonContent(content) LessonContent
    +readContent(row) LessonContent
  }
  class Attempts {
    <<module attempts.ts>>
    +submitAttempt(user, lessonId, body, timeZone) SubmitAttemptResponse
  }
  class Books {
    <<module books.ts>>
    +createBookUpload(user) CreateBookUploadResponse
    +receiveBookUpload(user, uploadId, req)
    +createBook(user, input) Book
    +ingestBook(bookId)
    +checkPreparedBook(prepared)
    +listBooks(user) / getBook(user, id)
  }
  class Children {
    <<module children.ts>>
    +createChild(user, input) Child
    +listChildren(user) Child[]
    +buildLearnerProfile(childId) LearnerProfile
    +knownSkillsOf(profile) string[]
  }
  class Subscription {
    <<module subscription.ts>>
    +startTrial(user, plan) Subscription
    +getSubscription(user)
    +fullAccess(user) boolean
  }
  class Streak {
    <<module streak.ts>>
    +recordActivity(childId, timeZone)
    +getStreakDays(user, childId) string[]
    +timeZoneOf(req) / localDay(tz)
  }
  class Analytics {
    <<module analytics.ts>>
    +getAdminAnalytics() AdminAnalyticsResponse
  }

  class Grading {
    <<module grading.ts, pure>>
    +gradeAttempt(content, answers) score and results
    +skillScores(results) Map
    +nextMastery(previous, skillScore) number
  }
  class Replan {
    <<module replan.ts>>
    +maybeStartReplan(curriculumId) ReplanTrigger
    +runReplan(curriculumId, trigger)
    +refreshLearnerNotes(childId)
    +startLearnerNotesRefresh(childId)
    +summarizeAttempt(attempt, lesson)
  }
  class ReplanPlan {
    <<module replan-plan.ts, pure>>
    +decideReplan(scores) ReplanTrigger
    +planReplan(input) insertAt and NewLesson[]
    +cleanDiagnosis(d) ReplanDiagnosis
  }
  class Feedback {
    <<module feedback.ts>>
    +attemptFeedback(input) AttemptFeedback
    +fallbackFeedback(results) AttemptFeedback
  }
  class Retrieval {
    <<module retrieval.ts>>
    +chunksForLesson(lesson, curriculum, lessons) string[]
    +sectionFor(lesson, lessons) number
  }
  class Pdf {
    <<module pdf.ts>>
    +extractPdfText(bytes) string
    +isPdf(bytes) boolean
  }
  class Access {
    <<module access.ts>>
    +ownedChild(user, id) ChildRow
    +ownedBook(user, id) BookRow
    +ownedCurriculum(user, id)
    +ownedLesson(user, id)
  }
  class Mappers {
    <<module mappers.ts>>
    +toCurriculum(...) Curriculum
    +toLessonSummary(row, fullAccess) LessonSummary
    +toReplanEvent(row) ReplanEvent
  }
  class Background {
    <<module background.ts>>
    +runInBackground(name, job)
    +flushBackground()
  }
  class SharedAccess {
    <<module lib/access.ts, shared>>
    +hasFullAccess(subscription, now) boolean
    +lessonLocked(position, fullAccess) boolean
  }

  Curricula --> Access
  Curricula --> Children
  Curricula --> Lessons
  Curricula --> Subscription
  Curricula --> Mappers
  Lessons --> Access
  Lessons --> Retrieval
  Lessons --> Children
  Lessons --> Subscription
  Lessons --> Background
  Attempts --> Access
  Attempts --> Grading
  Attempts --> Lessons
  Attempts --> Replan
  Attempts --> Feedback
  Attempts --> Streak
  Attempts --> Subscription
  Replan --> ReplanPlan
  Replan --> Lessons
  Replan --> Children
  Replan --> Background
  Books --> Access
  Books --> Pdf
  Books --> Background
  Subscription --> SharedAccess
  Mappers --> SharedAccess
  Streak --> Access
```

Every module in this diagram reaches the database through `getStore()` and models through `getAi()` (diagram 2); those arrows are left out to keep it readable.

## 4. AI module

```mermaid
classDiagram
  direction LR

  class aiService {
    <<object lib/ai/index.ts>>
    +generateOutline()
    +extendOutline()
    +generateLesson()
    +replan()
    +updateLearnerNotes()
    +writeAttemptFeedback()
    +prepareBook()
    +embed()
    -checkLessonOutlines(lessons)
  }
  class Client {
    <<module client.ts>>
    +callStructured(call) T
    +callEmbeddings(texts, options) number[][]
    -parseJson(text)
  }
  class Prompts {
    <<module prompts.ts>>
    +outlinePrompt(input) Prompt
    +extendPrompt(input) Prompt
    +lessonPrompt(input) Prompt
    +replanPrompt(input) Prompt
    +attemptFeedbackPrompt(input) Prompt
    +learnerNotesPrompt(input) Prompt
    +bookMapPrompt(title, chunks) Prompt
    +lessonSize(gradeLevel)
  }
  class Prompt {
    +system: string
    +user: string
  }
  class Blocks {
    <<module blocks.ts>>
    +buildBlocks(output) body, blocks, problems
  }
  class Chunk {
    <<module chunk.ts>>
    +chunkText(text) string[]
  }
  class Models {
    <<module models.ts>>
    +DEFAULT_MODELS: task to model id
  }
  class LessonBlocks {
    <<module lib/lesson-blocks.ts, shared>>
    +splitBody / placeBlocks
    +blockProblem(block) string
    +lessonWords(body, blocks)
  }
  class Expr {
    <<module lib/expr.ts, shared>>
    +compile(source, variables) Compiled
    +tryCompile(source, variables)
  }
  class AiError {
    +constructor(task, model, cause)
  }
  class InvalidOutputError
  Error <|-- AiError
  Error <|-- InvalidOutputError

  aiService --> Prompts
  aiService --> Client
  aiService --> Blocks
  aiService --> Chunk
  aiService --> Models
  Prompts --> Prompt
  Blocks --> LessonBlocks
  Blocks --> Expr
  LessonBlocks --> Expr
  Client ..> AiError : throws
  Client ..> InvalidOutputError : retries once
```

Each `AiService` method builds a prompt, calls `callStructured` with the Zod schema from `contracts/ai.ts` (sent as `response_format: json_schema, strict`), parses and checks the answer, sends it back once with the reason if it fails, and returns a typed object. It never touches the database.

## 5. Errors and the frontend client

```mermaid
classDiagram
  direction LR
  class Error
  class HttpError {
    <<lib/server/errors.ts>>
    +status: HTTP status 400 to 503
    +code: ApiErrorCode
  }
  class PdfLimitError {
    <<lib/server/pdf.ts>>
  }
  class ApiRequestError {
    <<lib/api.ts, browser>>
    +code: ApiErrorCode
  }
  class ExprError {
    <<lib/expr.ts>>
  }
  Error <|-- HttpError
  Error <|-- PdfLimitError
  Error <|-- ApiRequestError
  Error <|-- ExprError

  class api {
    <<object lib/api.ts>>
    +signUp / logIn / logOut / me
    +listChildren / createChild / getProfile / getStreak
    +listCurricula / createCurriculum / getCurriculum / extendCurriculum
    +getLesson / retryLesson / submitAttempt
    +listBooks / getBook / createBook (upload URL, PUT, register)
    +getSubscription / startTrial
    +adminAnalytics
    -request(schema, path, init)
  }
  class mockFetch {
    <<function lib/api-mock.ts>>
  }
  class useResource {
    <<hook lib/useResource.ts>>
  }
  api ..> ApiRequestError : throws
  api ..> mockFetch : NEXT_PUBLIC_API_MOCK
  useResource ..> api
```

`http.ts` turns an `HttpError` into the `ApiError` JSON envelope with its status; any other error becomes a generic 500. In the browser, `api.request` parses every response with the schema from `contracts/api.ts` and throws `ApiRequestError` with the same `code`.
