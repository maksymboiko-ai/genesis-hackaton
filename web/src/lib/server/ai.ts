import "server-only";
import type { AiCallOptions, AiService, LlmCallRecord } from "@/contracts/ai";
import { getEnv } from "./env";
import { HttpError, tooMany, upstream } from "./errors";
import { aiService } from "@/lib/ai";
import { fakeAi } from "./ai-fake";
import { getStore } from "./store";

// The backend's only door to the AI module. It adds two things around every
// call: llm_call logging (onCall) and the daily call budget.

const DAY_MS = 24 * 60 * 60 * 1000;

function baseService(): AiService {
  const env = getEnv();
  if (env.AI_MODE === "fake") return fakeAi;
  // Checked here, not at startup, so routes that never call a model keep
  // working without a key.
  if (!env.OPENROUTER_API_KEY) throw new Error("AI_MODE=real needs OPENROUTER_API_KEY");
  return aiService;
}

function logCall(record: LlmCallRecord) {
  // Fire and forget: logging must never fail or slow down a request.
  getStore()
    .insertLlmCall(record)
    .catch((err) => console.error("[ai] llm_call insert failed", err));
}

export async function assertBudget(): Promise<void> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const used = await getStore().countLlmCallsSince(since);
  if (used >= getEnv().DAILY_LLM_CALL_LIMIT) {
    throw tooMany("The daily AI budget is used up. Try again tomorrow.");
  }
}

const TASKS: Record<keyof AiService, LlmCallRecord["task"]> = {
  generateOutline: "outline",
  extendOutline: "extend",
  generateLesson: "lesson",
  replan: "replan",
  updateLearnerNotes: "learner_notes",
  prepareBook: "book_map",
  writeAttemptFeedback: "feedback",
  embed: "embed",
};

function wrap<K extends keyof AiService>(name: K): AiService[K] {
  return (async (input: unknown, options?: AiCallOptions) => {
    await assertBudget();
    const opts: AiCallOptions = {
      ...options,
      onCall: (record) => {
        logCall(record);
        options?.onCall?.(record);
      },
    };
    const fake = getEnv().AI_MODE === "fake";
    const started = Date.now();
    try {
      const base = baseService();
      // Called on the service object: lib/ai methods use `this` (prepareBook calls this.embed).
      const fn = base[name] as (this: AiService, i: unknown, o?: AiCallOptions) => Promise<unknown>;
      const result = await fn.call(base, input, opts);
      // The fake makes no model calls; record one so logging is exercised.
      if (fake) opts.onCall!({ task: TASKS[name], model: "fake", latencyMs: Date.now() - started, inputTokens: null, outputTokens: null, ok: true });
      return result;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error("[ai] %s failed", name, err);
      throw upstream();
    }
  }) as AiService[K];
}

export function getAi(): AiService {
  return {
    generateOutline: wrap("generateOutline"),
    extendOutline: wrap("extendOutline"),
    generateLesson: wrap("generateLesson"),
    replan: wrap("replan"),
    updateLearnerNotes: wrap("updateLearnerNotes"),
    prepareBook: wrap("prepareBook"),
    writeAttemptFeedback: wrap("writeAttemptFeedback"),
    embed: wrap("embed"),
  };
}
