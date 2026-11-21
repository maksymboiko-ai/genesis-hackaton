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
  task: "outline" | "lesson" | "replan" | "learner_notes" | "book_map" | "embed";
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

// A lesson in a new curriculum. bookSectionIndex is the BookSection the
// lesson is taught from; null when there is no book or no section fits.
export const OutlineLesson = LessonOutline.extend({
  bookSectionIndex: z.number().nullable(),
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
export const OutlineDraft = z.object({
  questions: z.array(z.string()),
  subject: z.string(),
  title: z.string(),
  lessons: z.array(
    LessonOutline.extend({
      // -1 when the lesson is not taught from a book section.
      bookSectionIndex: z.number(),
    }),
  ),
});
export type OutlineDraft = z.infer<typeof OutlineDraft>;

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
  explanation: z.string(),
  // One of the lesson's skills.
  skill: z.string(),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestion>;

export const LessonOutput = z.object({
  bodyMarkdown: z.string(),
  questions: z.array(GeneratedQuestion),
});
export type LessonOutput = z.infer<typeof LessonOutput>;

// The model only proposes new lessons. The backend decides where they go and
// adds the retry lessons itself.
export const ReplanOutput = z.object({
  diagnosis: z.object({
    summary: z.string(),
    mistakes: z.array(z.string()),
    missingSkills: z.array(z.string()),
  }),
  // "struggling": remedial lessons. "excelling": extension lessons.
  newLessons: z.array(LessonOutline),
});
export type ReplanOutput = z.infer<typeof ReplanOutput>;

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

  // Returns stored-form content: question ids assigned, slugs and choice
  // counts checked.
  generateLesson(
    input: GenerateLessonInput,
    options?: AiCallOptions,
  ): Promise<LessonContent>;

  replan(
    input: ReplanInput,
    options?: AiCallOptions,
  ): Promise<{ diagnosis: ReplanDiagnosis; newLessons: LessonOutline[] }>;

  updateLearnerNotes(
    input: UpdateLearnerNotesInput,
    options?: AiCallOptions,
  ): Promise<LearnerNotesOutput>;

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
