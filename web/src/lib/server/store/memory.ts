import "server-only";
import type { LlmCallRecord } from "@/contracts/ai";
import type { ChildRow, MasteryRow, Store } from "./types";

type LlmCallRow = LlmCallRecord & { id: string; createdAt: string };

export type MemoryData = {
  children: (ChildRow & { createdAt: string })[];
  mastery: MasteryRow[];
  llmCalls: LlmCallRow[];
};

export function emptyData(): MemoryData {
  return { children: [], mastery: [], llmCalls: [] };
}

const copy = <T>(value: T): T => structuredClone(value);

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function strip<T extends { createdAt: string }>(row: T): Omit<T, "createdAt"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { createdAt, ...rest } = row;
  return rest;
}

/** In-process store. Mirrors the SQL contract, including its constraints. */
export class MemoryStore implements Store {
  constructor(public data: MemoryData = emptyData()) {}

  async ping() {}

  async createChild(input: { name: string; gradeLevel: number }) {
    if (!Number.isInteger(input.gradeLevel) || input.gradeLevel < 1 || input.gradeLevel > 12) {
      throw new Error("check violation: grade_level");
    }
    const row = { id: uuid(), name: input.name, gradeLevel: input.gradeLevel, notes: "", createdAt: now() };
    this.data.children.push(row);
    return copy(strip(row));
  }

  async listChildren() {
    return [...this.data.children].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((c) => copy(strip(c)));
  }

  async getChild(id: string) {
    const row = this.data.children.find((c) => c.id === id);
    return row ? copy(strip(row)) : null;
  }

  async updateChildNotes(id: string, notes: string) {
    const row = this.data.children.find((c) => c.id === id);
    if (row) row.notes = notes;
  }

  async listMastery(childId: string) {
    return copy(this.data.mastery.filter((m) => m.childId === childId));
  }

  async insertLlmCall(record: LlmCallRecord) {
    this.data.llmCalls.push({ ...record, id: uuid(), createdAt: now() });
  }

  async countLlmCallsSince(sinceIso: string) {
    return this.data.llmCalls.filter((c) => c.createdAt > sinceIso).length;
  }
}
