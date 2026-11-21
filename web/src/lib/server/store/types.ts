import "server-only";
import type { LlmCallRecord } from "@/contracts/ai";

// Data access for the backend services. Two implementations: Supabase
// (production) and in-memory (tests, local runs without a database).
// Rows are camelCase; jsonb columns stay `unknown` until a service parses
// them with the contract schema.

export interface Store {
  /** Cheap connectivity check. */
  ping(): Promise<void>;

  // --- llm_call ---
  insertLlmCall(record: LlmCallRecord): Promise<void>;
  countLlmCallsSince(sinceIso: string): Promise<number>;
}
