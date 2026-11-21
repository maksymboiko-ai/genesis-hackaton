import "server-only";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import type { LlmCallRecord } from "@/contracts/ai";
import type { Store } from "./types";

/** Throws a plain Error on a database error; the route wrapper hides it. */
function check(error: PostgrestError | null, what: string): void {
  if (error) throw new Error(`db ${what}: ${error.code} ${error.message}`);
}

export class SupabaseStore implements Store {
  readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string, readonly booksBucket: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async ping() {
    const { error } = await this.db.from("llm_call").select("id").limit(1);
    check(error, "ping");
  }

  async insertLlmCall(r: LlmCallRecord) {
    const { error } = await this.db.from("llm_call").insert({
      task: r.task,
      model: r.model,
      latency_ms: Math.round(r.latencyMs),
      input_tokens: r.inputTokens,
      output_tokens: r.outputTokens,
      ok: r.ok,
    });
    check(error, "insert llm_call");
  }

  async countLlmCallsSince(sinceIso: string) {
    const { count, error } = await this.db
      .from("llm_call")
      .select("id", { count: "exact", head: true })
      .gt("created_at", sinceIso);
    check(error, "count llm_call");
    return count ?? 0;
  }
}

export { check };
