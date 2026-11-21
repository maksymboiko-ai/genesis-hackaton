// Contract between the frontend and the backend. Route handlers validate
// against these schemas; the frontend API client is typed from them.
// All bodies are JSON unless stated otherwise. All paths are under /api.
import { z } from "zod";
import {
  Book,
  Child,
  ContentStatus,
  Curriculum,
  Id,
  LearnerProfile,
  LessonSummary,
  Question,
  QuestionResult,
  ReplanTrigger,
} from "./domain";

// Every non-2xx response has this body.
export const ApiError = z.object({
  error: z.object({
    code: z.enum(["bad_request", "not_found", "conflict", "internal"]),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

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

// POST /books
// multipart/form-data with fields: title (string), file (PDF).
// Responds as soon as the file is stored; ingestion continues in the
// background and the book moves from "processing" to "ready" or "failed".
export const CreateBookResponse = Book;

// GET /books
export const ListBooksResponse = z.object({ books: z.array(Book) });
export type ListBooksResponse = z.infer<typeof ListBooksResponse>;

// GET /books/:bookId
export const GetBookResponse = Book;

// --- Curricula ------------------------------------------------------------

// POST /curricula
// Generates the outline before responding (expect several seconds), then
// starts generating the first lesson in the background.
export const CreateCurriculumRequest = z.object({
  childId: Id,
  prompt: z.string().min(1).max(2000),
  bookId: Id.nullable(),
});
export type CreateCurriculumRequest = z.infer<typeof CreateCurriculumRequest>;
export const CreateCurriculumResponse = Curriculum;

// GET /curricula?childId=...
export const ListCurriculaResponse = z.object({
  curricula: z.array(Curriculum.omit({ lessons: true, replanEvents: true })),
});
export type ListCurriculaResponse = z.infer<typeof ListCurriculaResponse>;

// GET /curricula/:curriculumId
// Poll this while replanStatus is "running" to pick up inserted lessons.
export const GetCurriculumResponse = Curriculum;

// --- Lessons --------------------------------------------------------------

// A question as the child sees it: no answer, no explanation.
export const PublicQuestion = Question.omit({
  correctIndex: true,
  explanation: true,
});
export type PublicQuestion = z.infer<typeof PublicQuestion>;

// GET /lessons/:lessonId
// If the content is "pending" this call starts generation. Poll until
// contentStatus is "ready" (content is non-null) or "failed".
export const GetLessonResponse = LessonSummary.extend({
  contentStatus: ContentStatus,
  content: z
    .object({
      bodyMarkdown: z.string(),
      questions: z.array(PublicQuestion),
    })
    .nullable(),
});
export type GetLessonResponse = z.infer<typeof GetLessonResponse>;

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
  replanTriggered: ReplanTrigger.nullable(),
  nextLessonId: Id.nullable(),
});
export type SubmitAttemptResponse = z.infer<typeof SubmitAttemptResponse>;
