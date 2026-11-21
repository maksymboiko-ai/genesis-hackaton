// Shared vocabulary. Every other contract file, the database schema and all
// three workstreams use these names and shapes. See ARCHITECTURE.md.
import { z } from "zod";

export const Id = z.string().uuid();

// A skill is a lowercase kebab-case slug, e.g. "solving-linear-equations".
// Lessons, quiz questions and mastery rows all refer to skills by this slug.
export const SkillSlug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

// core      - part of the plan: the original outline, or lessons added when
//             the child finished the plan and asked for more
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

// A new plan has as many lessons as its topic needs, up to this many.
export const MAX_OUTLINE_LESSONS = 30;
// "Keep going" on a finished plan adds up to this many lessons at a time,
// until the plan holds MAX_CURRICULUM_LESSONS.
export const MAX_EXTEND_LESSONS = 8;
export const MAX_CURRICULUM_LESSONS = 150;

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
  // Expected minutes, reading and quiz together. The model's estimate from
  // the outline until the content is ready, then computed from the content.
  estimatedMinutes: z.number().int().min(1).max(60),
  contentStatus: ContentStatus,
  // Questions in the lesson's quiz; null until the lesson is written. With
  // lastScore it gives the score as "6 of 7".
  questionCount: z.number().int().min(1).nullable(),
  completedAt: z.string().datetime().nullable(),
  lastScore: z.number().min(0).max(1).nullable(),
  // True when the account may not open the lesson: it is past the plan's
  // free lessons and the account has no running trial and has not paid.
  locked: z.boolean(),
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

// --- Interactive lesson blocks ----------------------------------------------
// A lesson body is Markdown plus blocks: graphs, number lines, quick checks
// and step-by-step examples. The model fills in a block's data; our own
// components draw it (ADR 0002: no model-written HTML or SVG). A block sits
// where the Markdown has a line holding only its id in double square
// brackets, e.g. [[graph-1]].

export const MAX_LESSON_BLOCKS = 10;

export const BlockId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40);

// A number or a formula over a graph's parameters, e.g. "3", "2*m + b",
// "sqrt(a^2 + b^2)". Parsed by lib/expr.ts, never evaluated as code.
export const Expr = z.string().min(1).max(120);

// A value the child changes with a slider (or by dragging a point); every
// expression of the graph is recomputed from the current values.
export const GraphParameter = z.object({
  // Short lowercase name used in expressions, e.g. "m". Not "x" or "y".
  name: z.string().regex(/^[a-z][a-z0-9]{0,7}$/),
  // What the slider is called, e.g. "Slope".
  label: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  // Where the slider starts.
  value: z.number(),
});
export type GraphParameter = z.infer<typeof GraphParameter>;

// primary: the thing the lesson is about. secondary: what it is compared
// with. muted: helper lines.
export const GraphTone = z.enum(["primary", "secondary", "muted"]);
export type GraphTone = z.infer<typeof GraphTone>;

const Drawn = { label: z.string(), tone: GraphTone };
const TwoPoints = { x1: Expr, y1: Expr, x2: Expr, y2: Expr, dashed: z.boolean(), ...Drawn };

export const GraphElement = z.discriminatedUnion("kind", [
  // A point whose x and y are each just a parameter name can be dragged.
  z.object({ kind: z.literal("point"), x: Expr, y: Expr, ...Drawn }),
  z.object({ kind: z.literal("segment"), ...TwoPoints }),
  // The whole line through the two points.
  z.object({ kind: z.literal("line"), ...TwoPoints }),
  // An arrow from the first point to the second.
  z.object({ kind: z.literal("vector"), ...TwoPoints }),
  z.object({ kind: z.literal("circle"), cx: Expr, cy: Expr, r: Expr, dashed: z.boolean(), ...Drawn }),
  // y = expr, where expr may also use x.
  z.object({ kind: z.literal("function"), expr: Expr, dashed: z.boolean(), ...Drawn }),
  z.object({
    kind: z.literal("polygon"),
    points: z.array(z.object({ x: Expr, y: Expr })).min(3).max(8),
    ...Drawn,
  }),
]);
export type GraphElement = z.infer<typeof GraphElement>;

// A coordinate plane.
export const GraphBlock = z.object({
  type: z.literal("graph"),
  id: BlockId,
  title: z.string(),
  // What to notice or try, one sentence; "" for none.
  caption: z.string(),
  xMin: z.number(),
  xMax: z.number(),
  yMin: z.number(),
  yMax: z.number(),
  parameters: z.array(GraphParameter).max(4),
  elements: z.array(GraphElement).min(1).max(12),
  // Live values shown under the graph, e.g. { label: "Slope", expr: "(d - b) / (c - a)" }.
  readouts: z.array(z.object({ label: z.string().min(1), expr: Expr })).max(4),
});
export type GraphBlock = z.infer<typeof GraphBlock>;

export const NumberLineBlock = z.object({
  type: z.literal("number_line"),
  id: BlockId,
  title: z.string(),
  caption: z.string(),
  min: z.number(),
  max: z.number(),
  // Distance between labelled ticks.
  step: z.number().positive(),
  // open: drawn hollow, for a value that is not included (x < 3).
  points: z.array(z.object({ value: z.number(), label: z.string(), open: z.boolean() })).max(8),
  // Shaded stretches; null runs off that end of the line (x > 2).
  ranges: z.array(z.object({ from: z.number().nullable(), to: z.number().nullable() })).max(3),
});
export type NumberLineBlock = z.infer<typeof NumberLineBlock>;

// A quick question inside the lesson. Not graded and not stored: the child
// gets the feedback at once, so the answer is sent to the browser.
export const CheckBlock = z.object({
  type: z.literal("check"),
  id: BlockId,
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(CHOICES_PER_QUESTION),
  answerIndex: z.number().int().min(0).max(CHOICES_PER_QUESTION - 1),
  // What to tell a child who picked each choice, in the order of choices.
  feedback: z.array(z.string().min(1)).min(2).max(CHOICES_PER_QUESTION),
});
export type CheckBlock = z.infer<typeof CheckBlock>;

// A worked example the child reveals one step at a time.
export const StepsBlock = z.object({
  type: z.literal("steps"),
  id: BlockId,
  // The problem being solved.
  title: z.string().min(1),
  steps: z
    .array(
      z.object({
        // What is done in this step and why; inline Markdown.
        text: z.string().min(1),
        // The line of working the step ends with, or "" for none.
        math: z.string(),
      }),
    )
    .min(2)
    .max(10),
});
export type StepsBlock = z.infer<typeof StepsBlock>;

export const LessonBlock = z.discriminatedUnion("type", [GraphBlock, NumberLineBlock, CheckBlock, StepsBlock]);
export type LessonBlock = z.infer<typeof LessonBlock>;

// Stored in lesson.content once contentStatus is "ready".
export const LessonContent = z.object({
  // May contain block placeholders: a line holding only [[block-id]].
  bodyMarkdown: z.string(),
  // Lessons written before blocks existed have none.
  blocks: z.array(LessonBlock).max(MAX_LESSON_BLOCKS).default([]),
  questions: z.array(Question).min(1),
});
export type LessonContent = z.infer<typeof LessonContent>;
// Content as it may be stored: `blocks` can be missing in older lessons.
export type LessonContentInput = z.input<typeof LessonContent>;

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

// --- Subscriptions ----------------------------------------------------------

// Every account starts with a free trial of this many days.
export const TRIAL_DAYS = 7;
// Without a running trial or a payment, an account can open this many lessons
// of each plan, counted from the start (position 0). The rest are locked.
export const FREE_LESSONS_PER_PLAN = 1;

export const BillingPlan = z.enum(["yearly", "monthly"]);
export type BillingPlan = z.infer<typeof BillingPlan>;

// A parent account's trial and payment state. One per account.
export const Subscription = z.object({
  plan: BillingPlan,
  trialStartedAt: z.string().datetime(),
  trialEndsAt: z.string().datetime(),
  // When the first payment went through; null while on trial or after a
  // trial that ended without paying.
  paidAt: z.string().datetime().nullable(),
});
export type Subscription = z.infer<typeof Subscription>;

// --- Product metrics --------------------------------------------------------

// The pilot: PILOT_FAMILIES families, one child each, PILOT_WEEKS weeks.
export const PILOT_FAMILIES = 30;
export const PILOT_WEEKS = 4;

// The pilot's goal: close at least this share of the learning gaps the app
// finds. A gap is found when a replan adds a remedial lesson; each remedial
// lesson is one gap.
export const GAP_CLOSE_TARGET = 0.6;
// A gap is closed when the child, on the first try at the remedial lesson's
// quiz (new questions on the same skill, no hints), gets this share right:
// 3 of 4.
export const GAP_CLOSED_FROM = 0.75;

// Supporting metric. Recovery rate: of the retry lessons children took, the
// share they passed. A retry exists for each lesson failed (scored below
// STRUGGLING_BELOW) in a "struggling" replan window, and comes after the
// remedial lessons; it is passed at STRUGGLING_BELOW or above.
export const RECOVERY_TARGET = 0.6;
// Guardrail: a learner should finish this many lessons in their first 7 days.
export const WEEK_ONE_LESSONS = 3;
// The pilot's payment goal: this many families pay for the next month.
export const PILOT_PAID_FAMILIES_TARGET = 6;
// For reference: the industry median trial-to-paid conversion.
export const TRIAL_TO_PAID_BENCHMARK = 0.35;
