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
  Clarification,
  LearnerProfile,
  LessonContent,
  ReplanDiagnosis,
  ReplanTrigger,
} from "./domain";

// One model call, reported through AiCallOptions.onCall. The backend writes
// these to the llm_call table; evals collect them in memory.
export type LlmCallRecord = {
  task: "outline" | "lesson" | "replan" | "learner_notes" | "embed";
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

export const OutlineOutput = z.object({
  subject: z.string(),
  title: z.string(),
  lessons: z.array(LessonOutline),
});
export type OutlineOutput = z.infer<typeof OutlineOutput>;

// What the model returns for an outline request. Either questions is empty
// and the rest is a full outline, or the goal is too vague to plan: then
// questions holds what to ask and lessons is [].
export const OutlineDraft = OutlineOutput.extend({
  questions: z.array(z.string()),
});
export type OutlineDraft = z.infer<typeof OutlineDraft>;

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
  // Excerpts from the source book, or [] when there is no book.
  sourceChunks: string[];
};

export type GenerateLessonInput = {
  subject: string;
  lesson: LessonOutline & { kind: "core" | "remedial" | "retry" | "extension" };
  learner: LearnerProfile;
  previousLessonTitles: string[];
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

  // RAG helpers. The backend stores the chunks and vectors and runs the
  // similarity query; see match_book_chunks in the database schema.
  chunkText(text: string): string[];
  // One vector of EMBEDDING_DIMENSIONS numbers per input, in order.
  embed(texts: string[], options?: AiCallOptions): Promise<number[][]>;
}

// Must match the vector(...) column in the database schema.
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
