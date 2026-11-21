// Shared vocabulary. Every other contract file, the database schema and all
// three workstreams use these names and shapes. See ARCHITECTURE.md.
import { z } from "zod";

export const Id = z.string().uuid();

// A skill is a lowercase kebab-case slug, e.g. "solving-linear-equations".
// Lessons, quiz questions and mastery rows all refer to skills by this slug.
export const SkillSlug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

// core      - part of the original outline
// remedial  - inserted by a replan to teach a missing skill
// retry     - a failed lesson scheduled again after its remedial lessons
// extension - appended by a replan because the child is excelling
export const LessonKind = z.enum(["core", "remedial", "retry", "extension"]);
export type LessonKind = z.infer<typeof LessonKind>;

export const ContentStatus = z.enum(["pending", "generating", "ready", "failed"]);
export type ContentStatus = z.infer<typeof ContentStatus>;

export const BookStatus = z.enum(["processing", "ready", "failed"]);
export type BookStatus = z.infer<typeof BookStatus>;

export const ReplanTrigger = z.enum(["struggling", "excelling"]);
export type ReplanTrigger = z.infer<typeof ReplanTrigger>;

export const ReplanStatus = z.enum(["idle", "running"]);
export type ReplanStatus = z.infer<typeof ReplanStatus>;

// Every quiz question has exactly this many choices.
export const CHOICES_PER_QUESTION = 4;

// Replan rule, applied by the backend after each attempt. The window is the
// most recent REPLAN_WINDOW attempts made since the last replan.
export const REPLAN_WINDOW = 3;
export const STRUGGLING_BELOW = 0.6;
export const EXCELLING_FROM = 0.9;

// Mastery update per skill after an attempt:
// mastery = (1 - MASTERY_ALPHA) * mastery + MASTERY_ALPHA * skillScore
export const MASTERY_ALPHA = 0.3;
export const MASTERY_START = 0.5;

// When a goal is too vague to plan, the app asks at most this many questions,
// once, before building the curriculum.
export const MAX_CLARIFYING_QUESTIONS = 3;

// A clarifying question the app asked and the answer it got.
export const Clarification = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});
export type Clarification = z.infer<typeof Clarification>;

export const Child = z.object({
  id: Id,
  name: z.string().min(1),
  gradeLevel: z.number().int().min(1).max(12),
});
export type Child = z.infer<typeof Child>;

// One section of an uploaded book. The list of sections, in reading order,
// is the "book map" built at ingestion and stored in book.sections. A
// curriculum built from a book is planned from the map, and each lesson
// retrieves its excerpts from one section.
export const BookSection = z.object({
  // Position in the map, from 0. book_chunk.section_index and
  // lesson.book_section_index refer to it.
  index: z.number().int().min(0),
  // The chapter the section belongs to, or "" when the book has none.
  chapter: z.string(),
  title: z.string(),
  // One or two sentences on what the section teaches.
  summary: z.string(),
});
export type BookSection = z.infer<typeof BookSection>;

// How many book chunks a lesson is generated from.
export const LESSON_CHUNK_LIMIT = 8;

export const Book = z.object({
  id: Id,
  title: z.string().min(1),
  status: BookStatus,
});
export type Book = z.infer<typeof Book>;

// A lesson as it appears in a curriculum listing: no body, no questions.
export const LessonSummary = z.object({
  id: Id,
  curriculumId: Id,
  position: z.number().int().min(0),
  kind: LessonKind,
  title: z.string(),
  objective: z.string(),
  skills: z.array(SkillSlug),
  retryOfLessonId: Id.nullable(),
  // Why the lesson is in the plan, in one sentence addressed to the child.
  // Null for core lessons; set for lessons a replan added.
  reason: z.string().nullable(),
  contentStatus: ContentStatus,
  completedAt: z.string().datetime().nullable(),
  lastScore: z.number().min(0).max(1).nullable(),
});
export type LessonSummary = z.infer<typeof LessonSummary>;

// Stored form of a question, including the answer. Never sent to the browser
// before the lesson is attempted; see PublicQuestion in api.ts.
export const Question = z.object({
  id: z.string(),
  prompt: z.string(),
  choices: z.array(z.string()).length(CHOICES_PER_QUESTION),
  correctIndex: z.number().int().min(0).max(CHOICES_PER_QUESTION - 1),
  // Why the correct choice is right.
  explanation: z.string(),
  // What to tell a child who picked each choice, in the order of choices:
  // for a wrong choice, the slip that leads to it and the right way.
  choiceFeedback: z.array(z.string()).length(CHOICES_PER_QUESTION),
  skill: SkillSlug,
});
export type Question= z.infer<typeof Question>;

// Stored in lesson.content once contentStatus is "ready".
export const LessonContent = z.object({
  bodyMarkdown: z.string(),
  questions: z.array(Question).min(1),
});
export type LessonContent = z.infer<typeof LessonContent>;

export const QuestionResult = z.object({
  questionId: z.string(),
  skill: SkillSlug,
  chosenIndex: z.number().int().min(0).max(CHOICES_PER_QUESTION - 1),
  correctIndex: z.number().int().min(0).max(CHOICES_PER_QUESTION - 1),
  correct: z.boolean(),
  // The feedback for the choice the child picked (Question.choiceFeedback).
  explanation: z.string(),
});
export type QuestionResult = z.infer<typeof QuestionResult>;

export const SkillMastery = z.object({
  subject: z.string(),
  skill: SkillSlug,
  mastery: z.number().min(0).max(1),
});
export type SkillMastery = z.infer<typeof SkillMastery>;

// What the app knows about a child. The backend builds it and passes it into
// every generation call; this is the "evolution" mechanism.
export const LearnerProfile = z.object({
  gradeLevel: z.number().int().min(1).max(12),
  notes: z.string(),
  mastery: z.array(SkillMastery),
});
export type LearnerProfile = z.infer<typeof LearnerProfile>;

export const ReplanDiagnosis = z.object({
  // For the parent: what happened and what changes.
  summary: z.string(),
  // For the child: the same news in one or two encouraging sentences.
  childMessage: z.string(),
  mistakes: z.array(z.string()),
  missingSkills: z.array(SkillSlug),
});
export type ReplanDiagnosis = z.infer<typeof ReplanDiagnosis>;

// One self-healing event, shown in the UI so the change is visible.
export const ReplanEvent = z.object({
  id: Id,
  curriculumId: Id,
  trigger: ReplanTrigger,
  diagnosis: ReplanDiagnosis,
  insertedLessonIds: z.array(Id),
  createdAt: z.string().datetime(),
});
export type ReplanEvent = z.infer<typeof ReplanEvent>;

export const Curriculum = z.object({
  id: Id,
  childId: Id,
  bookId: Id.nullable(),
  prompt: z.string(),
  subject: z.string(),
  title: z.string(),
  replanStatus: ReplanStatus,
  lessons: z.array(LessonSummary),
  replanEvents: z.array(ReplanEvent),
});
export type Curriculum = z.infer<typeof Curriculum>;
