// The one OpenRouter client. Every model call in the app goes through
// callStructured or callEmbeddings.
import OpenAI from "openai";
import { z } from "zod";
import type { LlmCallRecord } from "@/contracts/ai";
import type { GenerationTask } from "./models";

const REQUEST_TIMEOUT_MS = 90_000;

let client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
    client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 1,
    });
  }
  return client;
}

// Thrown by check functions when the output parses but breaks a rule the
// schema cannot express (counts, ranges, slugs).
export class InvalidOutputError extends Error {}

export class AiError extends Error {
  constructor(task: LlmCallRecord["task"], model: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`AI task "${task}" failed on ${model}: ${reason}`, { cause });
    this.name = "AiError";
  }
}

function parseJson(text: string): unknown {
  // Some providers wrap JSON in a code fence despite response_format.
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new InvalidOutputError("response is not valid JSON");
  }
}

type StructuredCall<S extends z.ZodType, T> = {
  task: GenerationTask;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: S;
  // Turns parsed output into the return value. Throws InvalidOutputError
  // when the output breaks a rule.
  check: (output: z.infer<S>) => T;
  // Cap on output tokens. Without one OpenRouter reserves credit for the
  // model's full output limit on every in-flight request.
  maxTokens?: number;
  onCall?: (record: LlmCallRecord) => void;
};

// One structured model call. Invalid output (or a failed request) is retried
// once, with the reason appended so the model can correct itself; the second
// failure throws AiError.
export async function callStructured<S extends z.ZodType, T>(
  call: StructuredCall<S, T>,
): Promise<T> {
  const jsonSchema: Record<string, unknown> = z.toJSONSchema(call.schema);
  // Strict modes reject keywords they do not know.
  delete jsonSchema.$schema;
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: call.system },
    { role: "user", content: call.user },
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const startedAt = Date.now();
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let ok = false;
    try {
      // `provider` is an OpenRouter extension: only route to endpoints that
      // support response_format.
      const body = {
        model: call.model,
        messages,
        response_format: {
          type: "json_schema" as const,
          json_schema: {
            name: call.schemaName,
            strict: true,
            schema: jsonSchema,
          },
        },
        provider: { require_parameters: true },
        ...(call.maxTokens ? { max_tokens: call.maxTokens } : {}),
      };
      const completion = await getClient().chat.completions.create(body);
      inputTokens = completion.usage?.prompt_tokens ?? null;
      outputTokens = completion.usage?.completion_tokens ?? null;

      const text = completion.choices[0]?.message?.content;
      if (!text) throw new InvalidOutputError("response has no content");
      const parsed = call.schema.safeParse(parseJson(text));
      if (!parsed.success) {
        throw new InvalidOutputError(z.prettifyError(parsed.error));
      }
      const result = call.check(parsed.data);
      ok = true;
      return result;
    } catch (error) {
      lastError = error;
      if (error instanceof InvalidOutputError && attempt === 0) {
        messages.push({
          role: "user",
          content: `Your previous answer was rejected: ${error.message}\nAnswer again with corrected JSON.`,
        });
      }
    } finally {
      call.onCall?.({
        task: call.task,
        model: call.model,
        latencyMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        ok,
      });
    }
  }
  throw new AiError(call.task, call.model, lastError);
}

export async function callEmbeddings(
  model: string,
  dimensions: number,
  texts: string[],
  onCall?: (record: LlmCallRecord) => void,
): Promise<number[][]> {
  const startedAt = Date.now();
  let inputTokens: number | null = null;
  let ok = false;
  try {
    const response = await getClient().embeddings.create({
      model,
      input: texts,
      dimensions,
      encoding_format: "float",
    });
    inputTokens = response.usage?.prompt_tokens ?? null;
    const vectors = [...response.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
    if (
      vectors.length !== texts.length ||
      vectors.some((vector) => vector.length !== dimensions)
    ) {
      throw new InvalidOutputError(
        `expected ${texts.length} vectors of ${dimensions} numbers`,
      );
    }
    ok = true;
    return vectors;
  } catch (error) {
    throw new AiError("embed", model, error);
  } finally {
    onCall?.({
      task: "embed",
      model,
      latencyMs: Date.now() - startedAt,
      inputTokens,
      outputTokens: null,
      ok,
    });
  }
}
