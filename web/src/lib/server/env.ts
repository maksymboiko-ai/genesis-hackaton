import "server-only";
import { z } from "zod";

// Server configuration, read lazily so `next build` works without secrets.
// Never import this from client code; `server-only` makes that a build error.
const EnvSchema = z
  .object({
    // "supabase" in every deployed environment. "memory" keeps data in the
    // process, for local runs without a database and for tests.
    STORE: z.enum(["supabase", "memory"]).default("supabase"),
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    SUPABASE_BOOKS_BUCKET: z.string().min(1).default("books"),
    // "real" calls lib/ai (OpenRouter). "fake" returns canned objects.
    AI_MODE: z.enum(["real", "fake"]).default("fake"),
    OPENROUTER_API_KEY: z.string().min(20).optional(),
    // Model calls allowed per rolling 24 hours, across the whole app.
    DAILY_LLM_CALL_LIMIT: z.coerce.number().int().positive().default(3000),
  })
  .superRefine((env, ctx) => {
    if (env.STORE === "supabase") {
      if (!env.SUPABASE_URL) ctx.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "required" });
      if (!env.SUPABASE_SERVICE_ROLE_KEY)
        ctx.addIssue({ code: "custom", path: ["SUPABASE_SERVICE_ROLE_KEY"], message: "required" });
    }
    if (env.AI_MODE === "real" && !env.OPENROUTER_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["OPENROUTER_API_KEY"], message: "required" });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    // Names only; never print values.
    const names = result.error.issues.map((i) => i.path.join("."));
    throw new Error(`Invalid server environment: ${[...new Set(names)].join(", ")}`);
  }
  cached = result.data;
  return cached;
}

/** Tests only. */
export function resetEnvForTests() {
  cached = undefined;
}
