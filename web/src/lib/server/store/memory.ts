import "server-only";
import type { LlmCallRecord } from "@/contracts/ai";
import type {
  BookRow,
  ChildRow,
  CurriculumRow,
  LessonRow,
  MasteryRow,
  NewLesson,
  ReplanEventRow,
  Store,
} from "./types";

type LlmCallRow = LlmCallRecord & { id: string; createdAt: string };

export type MemoryData = {
  children: (ChildRow & { createdAt: string })[];
  mastery: MasteryRow[];
  books: BookRow[];
  curricula: CurriculumRow[];
  lessons: LessonRow[];
  replanEvents: ReplanEventRow[];
  llmCalls: LlmCallRow[];
};

export function emptyData(): MemoryData {
  return { children: [], mastery: [], books: [], curricula: [], lessons: [], replanEvents: [], llmCalls: [] };
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

  async getBook(id: string) {
    const row = this.data.books.find((b) => b.id === id);
    return row ? copy(row) : null;
  }

  newLessonRow(curriculumId: string, position: number, l: NewLesson): LessonRow {
    if (!l.title || !l.objective) throw new Error("not null violation: lesson");
    return {
      id: uuid(),
      curriculumId,
      position,
      kind: l.kind,
      title: l.title,
      objective: l.objective,
      skills: [...l.skills],
      retryOfLessonId: l.retryOfLessonId,
      contentStatus: "pending",
      content: null,
      completedAt: null,
      lastScore: null,
      bookSectionIndex: l.bookSectionIndex,
      generationStartedAt: null,
      createdAt: now(),
    };
  }

  async createCurriculum(input: {
    childId: string;
    bookId: string | null;
    prompt: string;
    subject: string;
    title: string;
    lessons: NewLesson[];
  }) {
    if (!this.data.children.some((c) => c.id === input.childId)) throw new Error("fk violation: child");
    if (input.bookId && !this.data.books.some((b) => b.id === input.bookId)) throw new Error("fk violation: book");
    if (input.lessons.length === 0) throw new Error("p_lessons must be a non-empty array");
    const id = uuid();
    // Build everything first so a bad lesson leaves nothing behind.
    const lessons = input.lessons.map((l, i) => this.newLessonRow(id, i, { ...l, kind: "core", retryOfLessonId: null }));
    this.data.curricula.push({
      id,
      childId: input.childId,
      bookId: input.bookId,
      prompt: input.prompt,
      subject: input.subject,
      title: input.title,
      replanStatus: "idle",
      lastReplanAt: null,
      replanStartedAt: null,
      createdAt: now(),
    });
    this.data.lessons.push(...lessons);
    return id;
  }

  async listCurricula(childId: string) {
    return copy(
      this.data.curricula
        .filter((c) => c.childId === childId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async getCurriculum(id: string) {
    const row = this.data.curricula.find((c) => c.id === id);
    return row ? copy(row) : null;
  }

  async listLessons(curriculumId: string) {
    return copy(
      this.data.lessons
        .filter((l) => l.curriculumId === curriculumId)
        .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
    );
  }

  async listReplanEvents(curriculumId: string) {
    return copy(
      this.data.replanEvents
        .filter((e) => e.curriculumId === curriculumId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }

  async insertLlmCall(record: LlmCallRecord) {
    this.data.llmCalls.push({ ...record, id: uuid(), createdAt: now() });
  }

  async countLlmCallsSince(sinceIso: string) {
    return this.data.llmCalls.filter((c) => c.createdAt > sinceIso).length;
  }
}
