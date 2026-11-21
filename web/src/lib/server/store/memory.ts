import "server-only";
import type { LlmCallRecord } from "@/contracts/ai";
import type { Store } from "./types";

type LlmCallRow = LlmCallRecord & { id: string; createdAt: string };

export type MemoryData = {
  llmCalls: LlmCallRow[];
};

export function emptyData(): MemoryData {
  return { llmCalls: [] };
}

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

/** In-process store. Mirrors the SQL contract, including its constraints. */
export class MemoryStore implements Store {
  constructor(public data: MemoryData = emptyData()) {}

  async ping() {}

  async insertLlmCall(record: LlmCallRecord) {
    this.data.llmCalls.push({ ...record, id: uuid(), createdAt: now() });
  }

  async countLlmCallsSince(sinceIso: string) {
    return this.data.llmCalls.filter((c) => c.createdAt > sinceIso).length;
  }
}
