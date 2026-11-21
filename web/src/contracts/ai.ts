// Contract between the backend and the AI module (lib/ai).
//
// Rules for the AI module:
//   - It never reads or writes the database. Everything it needs arrives as
//     arguments; everything it produces is returned.
//   - Every function accepts an optional model override, so evals can run
//     the production code path against any OpenRouter model.
//   - Every return value has already been validated against the schemas
//     below. On invalid model output the function retries once, then throws.
//
// The *Output schemas are sent to OpenRouter as response_format json_schema.
// Keep them plain so they work across providers: objects, arrays, strings,
// numbers, booleans and enums only. No optional fields (use nullable), no
// length or range constraints. Check anything else in code after parsing.
import { z } from "zod";
import {
  BookSection,
  Clarification,
  LearnerProfile,
  LessonContent,
  ReplanDiagnosis,
  ReplanTrigger,
} from "./domain";

// One model call, reported through AiCallOptions.onCall. The backend writes
// these to the llm_call table; evals collect them in memory.
export type LlmCallRecord = {
  task: "outline" | "extend" | "lesson" | "replan" | "learner_notes" | "book_map" | "feedback" | "embed";
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  ok: boolean;
};

export type AiCallOptions = {
  // OpenRouter model id in "provider/model" form. Defaults to the
  // model configured for the task in lib/ai/models.ts.
  model?: string;
  // Called once per model call, including failed calls and retries.
  onCall?: (record: LlmCallRecord) => void;
};

// --- Shapes the model produces ---------------------------------------------

export const LessonOutline = z.object({
  title: z.string(),
  objective: z.string(),
  // Skill slugs, lowercase kebab-case. Reuse slugs from knownSkills.
  skills: z.array(z.string()),
});
export type LessonOutline = z.infer<typeof LessonOutline>;

// Added to every lesson the model plans (outline and replan): whole minutes
// the lesson takes, reading and quiz together, at the learner's grade.
// Checked in code: rounded and kept within 3 to 30.
const Timing = { estimatedMinutes: z.number() };

// A lesson in a new curriculum. bookSectionIndex is the BookSection the
// lesson is taught from; null when there is no book or no section fits.
export const OutlineLesson = LessonOutline.extend({
  bookSectionIndex: z.number().nullable(),
  ...Timing,
});
export type OutlineLesson = z.infer<typeof OutlineLesson>;

export const OutlineOutput = z.object({
  subject: z.string(),
  title: z.string(),
  lessons: z.array(OutlineLesson),
});
export type OutlineOutput = z.infer<typeof OutlineOutput>;

// What the model returns for an outline request. Either questions is empty
// and the rest is a full outline, or the goal is too vague to plan: then
// questions holds what to ask and lessons is [].
const DraftLesson = LessonOutline.extend({
  // -1 when the lesson is not taught from a book section.
  bookSectionIndex: z.number(),
  ...Timing,
});

export const OutlineDraft = z.object({
  questions: z.array(z.string()),
  subject: z.string(),
  title: z.string(),
  lessons: z.array(DraftLesson),
});
export type OutlineDraft = z.infer<typeof OutlineDraft>;

// What the model returns when a finished plan is continued: the next
// lessons only.
export const ExtendDraft = z.object({
  lessons: z.array(DraftLesson),
});
export type ExtendDraft = z.infer<typeof ExtendDraft>;

// What the model returns when mapping a book. It sees the chunks numbered
// from 0 and says where each section starts.
export const BookMapOutput = z.object({
  sections: z.array(
    z.object({
      chapter: z.string(),
      title: z.string(),
      summary: z.string(),
      // Index of the first chunk of the section. Strictly increasing.
      firstChunk: z.number(),
    }),
  ),
});
export type BookMapOutput = z.infer<typeof BookMapOutput>;

// What generateOutline returns. "questions" has 1 to
// MAX_CLARIFYING_QUESTIONS entries and only happens when
// GenerateOutlineInput.clarifications is empty, so there is one round at most.
export type OutlineResult =
  | { kind: "outline"; outline: OutlineOutput }
  | { kind: "questions"; questions: string[] };

export const GeneratedQuestion = z.object({
  prompt: z.string(),
  // Exactly CHOICES_PER_QUESTION entries.
  choices: z.array(z.string()),
  // Zero-based index into choices.
  correctIndex: z.number(),
  // One entry per choice, in the same order: what to tell a child who
  // picked it. Becomes Question.choiceFeedback; the entry at correctIndex
  // is also stored as Question.explanation.
  choiceFeedback: z.array(z.string()),
  // One of the lesson's skills.
  skill: z.string(),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestion>;

// The interactive blocks as the model writes them (stored form: LessonBlock
// in domain.ts). Kept flat so the schema works across providers: one object
// shape per array, every field always present, "" where a field does not
// apply. generateLesson turns them into LessonBlocks and checks them.

// An expression is a number or a formula as text: "3", "2*m + b".
export const GeneratedGraph = z.object({
  // Lowercase kebab-case, unique in the lesson, e.g. "graph-1".
  id: z.string(),
  title: z.string(),
  caption: z.string(),
  xMin: z.number(),
  xMax: z.number(),
  yMin: z.number(),
  yMax: z.number(),
  parameters: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      min: z.number(),
      max: z.number(),
      step: z.number(),
      value: z.number(),
    }),
  ),
  elements: z.array(
    z.object({
      kind: z.enum(["point", "segment", "line", "vector", "circle", "function", "polygon"]),
      label: z.string(),
      tone: z.enum(["primary", "secondary", "muted"]),
      dashed: z.boolean(),
      // point: its position. segment, line, vector: the first point.
      // circle: the center.
      x1: z.string(),
      y1: z.string(),
      // segment, line, vector: the second point.
      x2: z.string(),
      y2: z.string(),
      // circle: the radius.
      r: z.string(),
      // function: the right-hand side of y = ..., using x.
      expr: z.string(),
      // polygon: its corners in order.
      points: z.array(z.object({ x: z.string(), y: z.string() })),
    }),
  ),
  readouts: z.array(z.object({ label: z.string(), expr: z.string() })),
});
export type GeneratedGraph = z.infer<typeof GeneratedGraph>;

export const GeneratedNumberLine = z.object({
  id: z.string(),
  title: z.string(),
  caption: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  points: z.array(z.object({ value: z.number(), label: z.string(), open: z.boolean() })),
  // from and to as text: a number, or "" when the range runs off that end.
  ranges: z.array(z.object({ from: z.string(), to: z.string() })),
});
export type GeneratedNumberLine = z.infer<typeof GeneratedNumberLine>;

export const GeneratedCheck = z.object({
  id: z.string(),
  prompt: z.string(),
  // 2 to CHOICES_PER_QUESTION entries.
  choices: z.array(z.string()),
  correctIndex: z.number(),
  // One entry per choice, in the same order.
  feedback: z.array(z.string()),
});
export type GeneratedCheck = z.infer<typeof GeneratedCheck>;

export const GeneratedSteps = z.object({
  id: z.string(),
  title: z.string(),
  steps: z.array(z.object({ text: z.string(), math: z.string() })),
});
export type GeneratedSteps = z.infer<typeof GeneratedSteps>;

export const LessonOutput = z.object({
  // Places each block with a line holding only its id: [[graph-1]].
  bodyMarkdown: z.string(),
  graphs: z.array(GeneratedGraph),
  numberLines: z.array(GeneratedNumberLine),
  checks: z.array(GeneratedCheck),
  steppedExamples: z.array(GeneratedSteps),
  questions: z.array(GeneratedQuestion),
});
export type LessonOutput = z.infer<typeof LessonOutput>;

// A lesson a replan adds. reason is one sentence to the child on why the
// lesson is in the plan; the backend stores it in lesson.reason.
export const PlannedLesson = LessonOutline.extend({
  reason: z.string(),
  ...Timing,
});
export type PlannedLesson = z.infer<typeof PlannedLesson>;

// The model only proposes new lessons. The backend decides where they go and
// adds the retry lessons itself.
export const ReplanOutput = z.object({
  diagnosis: z.object({
    summary: z.string(),
    childMessage: z.string(),
    mistakes: z.array(z.string()),
    missingSkills: z.array(z.string()),
  }),
  // "struggling": remedial lessons. "excelling": extension lessons.
  newLessons: z.array(PlannedLesson),
});
export type ReplanOutput = z.infer<typeof ReplanOutput>;

// What the model says to the child right after a quiz: a short headline and
// one or two sentences about this attempt (what held up, what to look at).
export const AttemptFeedbackOutput = z.object({
  headline: z.string(),
  summary: z.string(),
});
export type AttemptFeedbackOutput = z.infer<typeof AttemptFeedbackOutput>;

export const LearnerNotesOutput = z.object({
  notes: z.string(),
});
export type LearnerNotesOutput = z.infer<typeof LearnerNotesOutput>;

// --- Function inputs --------------------------------------------------------

export type GenerateOutlineInput = {
  prompt: string;
  // Answers to the questions an earlier call returned, or [] on the first
  // call. When non-empty the result is always an outline.
  clarifications: Clarification[];
  learner: LearnerProfile;
  // Skill slugs this child already has mastery rows for, to be reused.
  knownSkills: string[];
  // The map of the source book, or [] when there is no book. The outline is
  // planned from the whole map, not from retrieved excerpts.
  bookSections: BookSection[];
};

// A lesson already in the plan, as the model sees it when continuing.
export type PlanLesson = LessonOutline & {
  kind: "core" | "remedial" | "retry" | "extension";
  // Share of quiz questions answered correctly on the latest attempt, 0 to
  // 1; null if the lesson was never attempted.
  score: number | null;
  // The book section the lesson was taught from, or null.
  bookSectionIndex: number | null;
};

export type ExtendOutlineInput = {
  // The goal the plan was built for, its subject and its title.
  prompt: string;
  subject: string;
  title: string;
  // Every lesson of the plan so far, in order. All of them are done.
  lessons: PlanLesson[];
  learner: LearnerProfile;
  knownSkills: string[];
  // The map of the plan's book, or [] when there is no book.
  bookSections: BookSection[];
  // How many lessons to plan at most.
  maxLessons: number;
};

export type GenerateLessonInput = {
  subject: string;
  lesson: LessonOutline & { kind: "core" | "remedial" | "retry" | "extension" };
  learner: LearnerProfile;
  previousLessonTitles: string[];
  // Excerpts from the lesson's book section in reading order, or [] when
  // there is no book.
  sourceChunks: string[];
};

export type LessonAttemptSummary = {
  lesson: LessonOutline;
  score: number;
  wrongAnswers: {
    prompt: string;
    chosen: string;
    correct: string;
    skill: string;
  }[];
};

export type ReplanInput = {
  trigger: ReplanTrigger;
  subject: string;
  learner: LearnerProfile;
  recentAttempts: LessonAttemptSummary[];
  remainingLessons: LessonOutline[];
  knownSkills: string[];
};

export type PrepareBookInput = {
  title: string;
  // The full text of the book, as extracted from the PDF.
  text: string;
};

// A book ready to store: its map, and every chunk with its section and
// embedding. Chunks are in reading order; a chunk's position in the array is
// its chunk_index.
export type PreparedBook = {
  sections: BookSection[];
  chunks: {
    content: string;
    sectionIndex: number;
    embedding: number[];
  }[];
};

export type AttemptFeedbackInput = {
  gradeLevel: number;
  subject: string;
  // The attempt, with each wrong answer as text.
  attempt: LessonAttemptSummary;
  // The questions answered correctly, so the feedback can name what held up.
  rightAnswers: { prompt: string; answer: string; skill: string }[];
};

export type UpdateLearnerNotesInput = {
  previousNotes: string;
  gradeLevel: number;
  recentAttempts: (LessonAttemptSummary & { subject: string })[];
};

// --- The interface ----------------------------------------------------------

export interface AiService {
  generateOutline(
    input: GenerateOutlineInput,
    options?: AiCallOptions,
  ): Promise<OutlineResult>;

  // The next lessons of a plan the child has finished: where the plan would
  // naturally go on, built on what was taught and how it went. 1 to
  // input.maxLessons lessons, none repeating a lesson of the plan.
  extendOutline(
    input: ExtendOutlineInput,
    options?: AiCallOptions,
  ): Promise<{ lessons: OutlineLesson[] }>;

  // Returns stored-form content: question ids assigned, slugs and choice
  // counts checked, every block valid and placed in the body.
  generateLesson(
    input: GenerateLessonInput,
    options?: AiCallOptions,
  ): Promise<LessonContent>;

  replan(
    input: ReplanInput,
    options?: AiCallOptions,
  ): Promise<{ diagnosis: ReplanDiagnosis; newLessons: PlannedLesson[] }>;

  updateLearnerNotes(
    input: UpdateLearnerNotesInput,
    options?: AiCallOptions,
  ): Promise<LearnerNotesOutput>;

  // Feedback shown with the quiz results. The backend calls it while the
  // attempt is submitted and falls back to a plain message on failure.
  writeAttemptFeedback(
    input: AttemptFeedbackInput,
    options?: AiCallOptions,
  ): Promise<AttemptFeedbackOutput>;

  // Book ingestion in one step: splits the text into chunks, maps the
  // book's sections and embeds every chunk. The backend stores the result.
  // options.model overrides the model that builds the map; chunks are always
  // embedded with EMBEDDING_MODEL.
  prepareBook(
    input: PrepareBookInput,
    options?: AiCallOptions,
  ): Promise<PreparedBook>;

  // Embeds retrieval queries (a lesson's title and objective) for
  // match_book_chunks in the database schema. One vector of
  // EMBEDDING_DIMENSIONS numbers per input, in order.
  embed(texts: string[], options?: AiCallOptions): Promise<number[][]>;
}

// Must match the vector(...) column in the database schema.
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
