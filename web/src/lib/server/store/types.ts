import "server-only";
import type { LlmCallRecord } from "@/contracts/ai";

// Data access for the backend services. Two implementations: Supabase
// (production) and in-memory (tests, local runs without a database).
// Rows are camelCase; jsonb columns stay `unknown` until a service parses
// them with the contract schema.

export type ChildRow = {
  id: string;
  name: string;
  gradeLevel: number;
  notes: string;
};

export type MasteryRow = {
  childId: string;
  subject: string;
  skill: string;
  mastery: number;
};

export interface Store {
  /** Cheap connectivity check. */
  ping(): Promise<void>;

  // --- child, skill_mastery ---
  createChild(input: { name: string; gradeLevel: number }): Promise<ChildRow>;
  listChildren(): Promise<ChildRow[]>;
  getChild(id: string): Promise<ChildRow | null>;
  updateChildNotes(id: string, notes: string): Promise<void>;
  listMastery(childId: string): Promise<MasteryRow[]>;

  // --- llm_call ---
  insertLlmCall(record: LlmCallRecord): Promise<void>;
  countLlmCallsSince(sinceIso: string): Promise<number>;
}
