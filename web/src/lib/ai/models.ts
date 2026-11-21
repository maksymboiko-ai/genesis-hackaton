// Default OpenRouter model for each task. Every AiService function accepts a
// model override; evals use it to compare candidates.
import type { LlmCallRecord } from "@/contracts/ai";

export type GenerationTask = Exclude<LlmCallRecord["task"], "embed">;

export const DEFAULT_MODELS: Record<GenerationTask, string> = {
  outline: "google/gemini-3.8-flash",
  lesson: "google/gemini-3.8-flash",
  replan: "google/gemini-3.8-flash",
  learner_notes: "openai/gpt-6-luna",
};
