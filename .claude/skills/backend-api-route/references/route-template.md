# Route templates

Starting points for `lib/server/errors.ts`, `lib/server/http.ts` and a route.
Adapt, don't paste blindly: check the Next.js docs in `web/node_modules/next/dist/docs/`
if an API behaves differently in this version.

## lib/server/errors.ts

```ts
import "server-only";

export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 413 | 415 | 429,
    public readonly code: "bad_request" | "not_found" | "conflict",
    message: string,
  ) {
    super(message);
  }
}
export const badRequest = (m = "Invalid request") => new HttpError(400, "bad_request", m);
export const notFound = (what = "Resource") => new HttpError(404, "not_found", `${what} not found`);
export const conflict = (m: string) => new HttpError(409, "conflict", m);
// 413/415/429 still use code "bad_request" because the ApiError enum has no other values.
export const tooLarge = (m = "Request body too large") => new HttpError(413, "bad_request", m);
export const unsupported = (m = "Unsupported media type") => new HttpError(415, "bad_request", m);
export const tooMany = (m = "Too many requests") => new HttpError(429, "bad_request", m);
```

## lib/server/http.ts

```ts
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ApiError } from "@/contracts/api";
import { HttpError, badRequest, tooLarge, unsupported } from "./errors";

const MAX_JSON_BYTES = 64 * 1024; // JSON bodies in this API are small

function errorBody(code: ApiError["error"]["code"], message: string): ApiError {
  return { error: { code, message } };
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a handler: maps known errors to the ApiError envelope, hides internals. */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json(errorBody(err.code, err.message), { status: err.status });
      }
      const requestId = crypto.randomUUID();
      // Log the detail server-side only. Never log child names, notes or prompts.
      console.error(`[api] ${requestId} ${req.method} ${new URL(req.url).pathname}`, err);
      return NextResponse.json(errorBody("internal", `Internal error (ref ${requestId})`), {
        status: 500,
      });
    }
  };
}

/** Reads and validates a JSON body with a size cap. */
export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw unsupported("Expected application/json");
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_JSON_BYTES) throw tooLarge();

  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) throw tooLarge();

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw badRequest("Malformed JSON");
  }
  return parseWith(schema, raw);
}

/** Validates any unknown value (params, query) against a schema. */
export function parseWith<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    // Field paths only; never echo the submitted values back.
    const fields = result.error.issues.map((i) => i.path.join(".") || "(root)");
    throw badRequest(`Invalid fields: ${[...new Set(fields)].join(", ")}`);
  }
  return result.data;
}

/** Serializes through the contract schema so nothing outside the contract leaks. */
export function ok<T extends z.ZodType>(schema: T, data: z.input<T>, status = 200) {
  return NextResponse.json(schema.parse(data), { status });
}
```

## A route: app/api/lessons/[lessonId]/attempts/route.ts

```ts
import { z } from "zod";
import { Id } from "@/contracts/domain";
import { SubmitAttemptRequest, SubmitAttemptResponse } from "@/contracts/api";
import { route, parseJson, parseWith, ok } from "@/lib/server/http";
import { submitAttempt } from "@/lib/server/grading";

const Params = z.object({ lessonId: Id });

export const POST = route(
  async (req: Request, ctx: { params: Promise<{ lessonId: string }> }) => {
    const { lessonId } = parseWith(Params, await ctx.params);
    const body = await parseJson(req, SubmitAttemptRequest);
    const result = await submitAttempt(lessonId, body); // throws notFound / conflict
    return ok(SubmitAttemptResponse, result, 201);
  },
);
```

## Background work with after()

```ts
import { after } from "next/server";

after(async () => {
  try {
    const claimed = await claimLessonForGeneration(lessonId); // pending → generating
    if (!claimed) return;                                     // someone else has it
    await generateAndStoreLesson(lessonId);
  } catch (err) {
    console.error("[after] lesson generation failed", lessonId, err);
    await markLessonFailed(lessonId);                         // never leave it 'generating'
  }
});
```

## Grading checks for submitAttempt (in lib/server/grading.ts)

```ts
// content is LessonContent parsed from lesson.content (jsonb) with the domain schema
const ids = new Set(content.questions.map((q) => q.id));
const answered = new Set<string>();
for (const a of body.answers) {
  if (!ids.has(a.questionId)) throw badRequest("Unknown questionId");
  if (answered.has(a.questionId)) throw badRequest("Question answered twice");
  if (a.chosenIndex >= CHOICES_PER_QUESTION) throw badRequest("chosenIndex out of range");
  answered.add(a.questionId);
}
if (answered.size !== ids.size) throw badRequest("Every question must be answered");
```
