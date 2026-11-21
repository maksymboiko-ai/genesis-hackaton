// Default OpenRouter model for each task. Every AiService function accepts a
// model override; evals use it to compare candidates. The choices come from
// evals/REPORT.md.
import type { LlmCallRecord } from "@/contracts/ai";

export type GenerationTask = Exclude<LlmCallRecord["task"], "embed">;

export const DEFAULT_MODELS: Record<GenerationTask, string> = {
  outline: "openai/gpt-6-luna",
  // The same job as the outline, from a finished plan instead of a goal.
  extend: "openai/gpt-6-luna",
  lesson: "google/gemini-3.5-flash-lite",
  replan: "google/gemini-3.8-flash",
  learner_notes: "openai/gpt-6-luna",
  book_map: "openai/gpt-6-luna",
  // Short text on the results screen, on the request path: a fast model.
  feedback: "google/gemini-3.5-flash-lite",
};
