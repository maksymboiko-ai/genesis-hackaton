// Contract between the frontend and the backend. Route handlers validate
// against these schemas; the frontend API client is typed from them.
// All bodies are JSON unless stated otherwise. All paths are under /api.
import { z } from "zod";
import {
  BillingPlan,
  Book,
  Child,
  Clarification,
  ContentStatus,
  Curriculum,
  Id,
  LearnerProfile,
  LessonBlock,
  LessonSummary,
  MAX_CLARIFYING_QUESTIONS,
  Question,
  QuestionResult,
  ReplanTrigger,
  Subscription,
} from "./domain";

// Every non-2xx response has this body.
export const ApiError = z.object({
  error: z.object({
    // unauthorized: no valid session (401), or a cross-site request (403).
    code: z.enum(["bad_request", "unauthorized", "not_found", "conflict", "internal"]),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

// --- Accounts ---------------------------------------------------------------
// Parents sign up and sign in through these endpoints; the session lives in
// two httpOnly cookies set by the server (sb-access, sb-refresh, Path=/api),
// so the browser sends it with every /api request and JavaScript never sees
// the tokens. Every other endpoint needs a session and answers 401
// "unauthorized" without one. A parent only ever sees their own children,
// curricula, lessons and books; anything else is "not_found".

export const AuthUser = z.object({
  id: Id,
  email: z.string(),
  name: z.string(),
});
export type AuthUser = z.infer<typeof AuthUser>;

// POST /auth/signup — creates the account and signs in.
export const SignUpRequest = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  password: z.string().min(8).max(72),
});
export type SignUpRequest = z.infer<typeof SignUpRequest>;

// POST /auth/login
export const LoginRequest = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(72),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

// Response of signup, login and GET /auth/me.
export const AuthResponse = z.object({ user: AuthUser });
export type AuthResponse = z.infer<typeof AuthResponse>;

// POST /auth/logout — ends the session and clears the cookies. No body.
export const LogoutResponse = z.object({ ok: z.literal(true) });

// --- Children -------------------------------------------------------------

// POST /children
export const CreateChildRequest = Child.omit({ id: true });
export type CreateChildRequest = z.infer<typeof CreateChildRequest>;
export const CreateChildResponse = Child;

// GET /children
export const ListChildrenResponse = z.object({ children: z.array(Child) });
export type ListChildrenResponse = z.infer<typeof ListChildrenResponse>;

// GET /children/:childId/profile
export const GetProfileResponse = LearnerProfile;

// --- Books (RAG sources) --------------------------------------------------

// Uploading a book takes three requests, because the PDF (up to 20 MB) is too
// large to pass through an API route on Vercel (4.5 MB request limit):
//   1. POST /books/uploads        -> uploadId, uploadUrl
//   2. PUT uploadUrl              body: the file, Content-Type: application/pdf
//   3. POST /books                { title, uploadId }

// POST /books/uploads (no body)
// uploadUrl is short-lived, takes one file, and is not under /api: it points
// at file storage. Use it as given.
export const CreateBookUploadResponse = z.object({ uploadId: Id, uploadUrl: z.string().min(1) });
export type CreateBookUploadResponse = z.infer<typeof CreateBookUploadResponse>;

// POST /books
// Checks the uploaded file (a PDF of 20 MB or less) and responds; ingestion
// continues in the background and the book moves from "processing" to
// "ready" or "failed".
export const CreateBookRequest = z.object({ title: z.string().min(1).max(200), uploadId: Id });
export type CreateBookRequest = z.infer<typeof CreateBookRequest>;
export const CreateBookResponse = Book;

// GET /books
export const ListBooksResponse = z.object({ books: z.array(Book) });
export type ListBooksResponse = z.infer<typeof ListBooksResponse>;

// GET /books/:bookId
export const GetBookResponse = Book;

// --- Curricula ------------------------------------------------------------

// POST /curricula
// Generates the outline before responding (expect several seconds), then
// starts generating the first lesson in the background. The plan is as long
// as the goal needs: a few lessons for one narrow skill, up to
// MAX_OUTLINE_LESSONS for a whole subject.
//
// If the prompt is too vague to plan, nothing is stored and the response is
// "needs_clarification". Show the questions, then send the same request again
// with the answers in clarifications; that call always creates the curriculum.
export const CreateCurriculumRequest = z.object({
  childId: Id,
  prompt: z.string().min(1).max(2000),
  bookId: Id.nullable(),
  // [] on the first call.
  clarifications: z.array(Clarification).max(MAX_CLARIFYING_QUESTIONS),
  // One of the child's grade subjects (contracts/subjects.ts), or null to
  // let the plan pick the grade subject the goal is about.
  subject: z.string().trim().min(1).max(80).nullish(),
});
export type CreateCurriculumRequest = z.infer<typeof CreateCurriculumRequest>;
export const CreateCurriculumResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("created"), curriculum: Curriculum }),
  z.object({
    status: z.literal("needs_clarification"),
    questions: z.array(z.string()).min(1).max(MAX_CLARIFYING_QUESTIONS),
  }),
]);
export type CreateCurriculumResponse = z.infer<typeof CreateCurriculumResponse>;

// GET /children/:childId/streak
// The days the child finished a quiz, newest first, as YYYY-MM-DD in the
// child's calendar. The app derives the streak, freezes and week view.
export const GetStreakResponse = z.object({
  days: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});
export type GetStreakResponse = z.infer<typeof GetStreakResponse>;

// GET /curricula?childId=...
export const ListCurriculaResponse = z.object({
  curricula: z.array(Curriculum.omit({ lessons: true, replanEvents: true })),
});
export type ListCurriculaResponse = z.infer<typeof ListCurriculaResponse>;

// GET /curricula/:curriculumId
// Poll this while replanStatus is "running" to pick up inserted lessons.
export const GetCurriculumResponse = Curriculum;

// POST /curricula/:curriculumId/extend
// "Keep going": the child finished every lesson and wants more. Plans up to
// MAX_EXTEND_LESSONS further lessons from the plan so far and the child's
// results, appends them as "core" lessons and starts generating the first.
// Responds when they are in place (expect several seconds). No body.
// "conflict" (409) when a lesson is still unfinished, the plan is being
// changed right now, or it already holds MAX_CURRICULUM_LESSONS.
export const ExtendCurriculumResponse = Curriculum;

// --- Lessons --------------------------------------------------------------

// A quiz question as the child sees it: no answer, no explanation, no
// per-choice feedback (it gives the answer away).
export const PublicQuestion = Question.omit({
  correctIndex: true,
  explanation: true,
  choiceFeedback: true,
});
export type PublicQuestion = z.infer<typeof PublicQuestion>;

// GET /lessons/:lessonId
// If the content is "pending" this call starts generation. Poll until
// contentStatus is "ready" (content is non-null) or "failed".
export const GetLessonResponse = LessonSummary.extend({
  contentStatus: ContentStatus,
  content: z
    .object({
      // Markdown with block placeholders: a line holding only [[block-id]]
      // is where the block with that id goes.
      bodyMarkdown: z.string(),
      // Graphs, number lines, quick checks and step-by-step examples. Sent
      // whole, answers of the quick checks included: they are practice with
      // instant feedback and are never graded.
      blocks: z.array(LessonBlock),
      questions: z.array(PublicQuestion),
    })
    .nullable(),
});
export type GetLessonResponse = z.infer<typeof GetLessonResponse>;

// POST /lessons/:lessonId/retry
// The "Try again" button for a lesson whose contentStatus is "failed": starts
// generation again at once. (A GET retries a failed lesson only a minute
// after the failure, so polling never loops on paid retries.) A lesson that
// is ready or still generating is returned as it is. No body.
export const RetryLessonResponse = GetLessonResponse;

// POST /lessons/:lessonId/attempts
// Every question must be answered exactly once.
export const SubmitAttemptRequest = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string(),
        chosenIndex: z.number().int().min(0),
      }),
    )
    .min(1),
});
export type SubmitAttemptRequest = z.infer<typeof SubmitAttemptRequest>;

// Grading is done in code, so this responds immediately. If the attempt
// triggered a replan, replanTriggered names it and the curriculum's
// replanStatus is "running" until the new lessons are in place.
export const SubmitAttemptResponse = z.object({
  attemptId: Id,
  score: z.number().min(0).max(1),
  results: z.array(QuestionResult),
  // Shown above the results, to the child. headline: a few words ("Nice. The
  // sign is starting to stick."); summary: one or two sentences on what held
  // up and what to look at again.
  feedback: z.object({ headline: z.string(), summary: z.string() }),
  replanTriggered: ReplanTrigger.nullable(),
  nextLessonId: Id.nullable(),
});
export type SubmitAttemptResponse = z.infer<typeof SubmitAttemptResponse>;

// --- Subscription -----------------------------------------------------------

// POST /subscription
// "Start free trial" on the paywall: starts the account's TRIAL_DAYS trial on
// the chosen plan. An account has one trial; a second call changes nothing
// and returns the trial already running. No payment is taken here.
export const StartTrialRequest = z.object({ plan: BillingPlan });
export type StartTrialRequest = z.infer<typeof StartTrialRequest>;
export const StartTrialResponse = Subscription;

// --- Admin ------------------------------------------------------------------

// A share from 0 to 1, or null when there is nothing to divide by yet.
const Rate = z.number().min(0).max(1).nullable();
const Count = z.number().int().min(0);

// GET /admin/analytics
// Product-wide numbers, across all families: counts and rates only, never a
// name, a prompt or an email. Only for the accounts listed in the server's
// ADMIN_EMAILS; every other account gets "not_found".
export const AdminAnalyticsResponse = z.object({
  generatedAt: z.string().datetime(),
  // The key metric (RECOVERY_TARGET in domain.ts).
  recovery: z.object({
    // passed / taken.
    rate: Rate,
    target: z.number(),
    // Failed lessons a replan scheduled a retry for.
    scheduled: Count,
    // Retries the child has done, and those scored at the pass mark or above.
    taken: Count,
    passed: Count,
    bySubject: z.array(z.object({ subject: z.string(), taken: Count, passed: Count, rate: Rate })),
  }),
  // Guardrail: learners who finished WEEK_ONE_LESSONS lessons within 7 days
  // of being added. rate = reached / learners.
  weekOne: z.object({
    rate: Rate,
    lessonsTarget: Count,
    learners: Count,
    reached: Count,
    // Learners still inside their first 7 days; they may yet reach it.
    inFirstWeek: Count,
  }),
  // Guardrail: of the trials that are over (ended or paid), the share paid.
  trialToPaid: z.object({
    rate: Rate,
    benchmark: z.number(),
    trialsStarted: Count,
    trialsActive: Count,
    trialsOver: Count,
    paid: Count,
  }),
  usage: z.object({
    parents: Count,
    learners: Count,
    // Learners who finished a lesson in the last 7 days.
    activeLearners: Count,
    plans: Count,
    lessonsDone: Count,
    averageScore: Rate,
    replans: z.object({ struggling: Count, excelling: Count }),
  }),
  // Model calls from llm_call over the last windowDays days.
  ai: z.object({
    windowDays: Count,
    calls: Count,
    failed: Count,
    inputTokens: Count,
    outputTokens: Count,
    // Against the server's DAILY_LLM_CALL_LIMIT.
    callsLast24h: Count,
    dailyLimit: Count,
    // One row per task and model, most calls first.
    byTask: z.array(
      z.object({
        task: z.string(),
        model: z.string(),
        calls: Count,
        failed: Count,
        medianLatencyMs: Count,
        p95LatencyMs: Count,
        inputTokens: Count,
        outputTokens: Count,
      }),
    ),
    // Every day of the window, oldest first (UTC days, YYYY-MM-DD).
    byDay: z.array(z.object({ day: z.string(), calls: Count, failed: Count })),
    // Lesson content by state, all time.
    lessons: z.object({ ready: Count, failed: Count, waiting: Count }),
  }),
});
export type AdminAnalyticsResponse = z.infer<typeof AdminAnalyticsResponse>;
