import "server-only";
import type { LlmCallRecord } from "@/contracts/ai";
import type {
  AttemptRow,
  BookRow,
  ChunkHit,
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
  chunks: ChunkRow[];
  attempts: AttemptRow[];
  files: Map<string, Uint8Array>;
  llmCalls: LlmCallRow[];
};



export type ChunkRow = { bookId: string; chunkIndex: number; content: string; sectionIndex: number; embedding: number[] };

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function emptyData(): MemoryData {
  return { children: [], mastery: [], books: [], curricula: [], lessons: [], replanEvents: [], chunks: [], attempts: [], files: new Map(), llmCalls: [] };
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

  async createBook(input: { title: string; storagePath: string }) {
    const row: BookRow & { createdAt: string } = {
      id: uuid(),
      title: input.title,
      storagePath: input.storagePath,
      status: "processing",
      sections: [],
      createdAt: now(),
    };
    this.data.books.push(row);
    return copy(strip(row));
  }

  async listBooks() {
    return [...this.data.books]
      .sort((a, b) => ((b as { createdAt?: string }).createdAt ?? "").localeCompare((a as { createdAt?: string }).createdAt ?? ""))
      .map((b) => copy(strip({ createdAt: "", ...b })));
  }

  async completeBook(
    id: string,
    sections: unknown,
    chunks: { chunkIndex: number; content: string; sectionIndex: number; embedding: number[] }[],
  ) {
    const book = this.data.books.find((b) => b.id === id);
    if (!book) throw new Error("book not found");
    const seen = new Set<number>();
    for (const c of chunks) {
      if (seen.has(c.chunkIndex)) throw new Error("unique violation: book_chunk");
      seen.add(c.chunkIndex);
    }
    this.data.chunks.push(...chunks.map((c) => ({ ...copy(c), bookId: id })));
    book.sections = copy(sections);
    book.status = "ready";
  }

  async failBook(id: string) {
    const book = this.data.books.find((b) => b.id === id);
    if (book) book.status = "failed";
    this.data.chunks = this.data.chunks.filter((c) => c.bookId !== id);
  }

  async uploadFile(path: string, bytes: Uint8Array) {
    if (this.data.files.has(path)) throw new Error("file exists");
    this.data.files.set(path, new Uint8Array(bytes));
  }

  async downloadFile(path: string) {
    const bytes = this.data.files.get(path);
    if (!bytes) throw new Error("file not found");
    return new Uint8Array(bytes);
  }

  async getBook(id: string) {
    const row = this.data.books.find((b) => b.id === id);
    return row ? copy(strip({ createdAt: "", ...row })) : null;
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

  async getLesson(id: string) {
    const row = this.data.lessons.find((l) => l.id === id);
    return row ? copy(row) : null;
  }

  async claimLesson(id: string, staleBeforeIso: string, retryBeforeIso: string) {
    const row = this.data.lessons.find((l) => l.id === id);
    if (!row) return false;
    const started = row.generationStartedAt;
    const ok =
      row.contentStatus === "pending" ||
      (row.contentStatus === "failed" && (!started || started < retryBeforeIso)) ||
      (row.contentStatus === "generating" && (!started || started < staleBeforeIso));
    if (!ok) return false;
    row.contentStatus = "generating";
    row.generationStartedAt = now();
    return true;
  }

  async saveLessonContent(id: string, content: unknown) {
    const row = this.data.lessons.find((l) => l.id === id && l.contentStatus === "generating");
    if (!row) return;
    row.content = copy(content);
    row.contentStatus = "ready";
  }

  async failLesson(id: string) {
    const row = this.data.lessons.find((l) => l.id === id && l.contentStatus === "generating");
    if (row) row.contentStatus = "failed";
  }

  async recordAttempt(input: {
    lessonId: string;
    score: number;
    results: unknown;
    childId: string;
    subject: string;
    mastery: { skill: string; mastery: number }[];
  }) {
    const lesson = this.data.lessons.find((l) => l.id === input.lessonId);
    if (!lesson) throw new Error("fk violation: lesson");
    if (!(input.score >= 0 && input.score <= 1)) throw new Error("check violation: score");
    if (input.mastery.some((m) => !(m.mastery >= 0 && m.mastery <= 1))) throw new Error("check violation: mastery");
    const id = uuid();
    const at = now();
    this.data.attempts.push({ id, lessonId: input.lessonId, score: input.score, results: copy(input.results), createdAt: at });
    lesson.completedAt ??= at;
    lesson.lastScore = input.score;
    for (const m of input.mastery) {
      const row = this.data.mastery.find(
        (r) => r.childId === input.childId && r.subject === input.subject && r.skill === m.skill,
      );
      if (row) row.mastery = m.mastery;
      else this.data.mastery.push({ childId: input.childId, subject: input.subject, skill: m.skill, mastery: m.mastery });
    }
    return id;
  }

  async listCurriculumAttempts(curriculumId: string, sinceIso: string | null, limit: number) {
    const ids = new Set(this.data.lessons.filter((l) => l.curriculumId === curriculumId).map((l) => l.id));
    return copy(
      this.data.attempts
        .filter((a) => ids.has(a.lessonId) && (sinceIso === null || a.createdAt > sinceIso))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    );
  }

  async listChildAttempts(childId: string, limit: number) {
    const curricula = new Set(this.data.curricula.filter((c) => c.childId === childId).map((c) => c.id));
    const lessons = new Set(this.data.lessons.filter((l) => curricula.has(l.curriculumId)).map((l) => l.id));
    return copy(
      this.data.attempts
        .filter((a) => lessons.has(a.lessonId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    );
  }

  async claimReplan(curriculumId: string, staleBeforeIso: string) {
    const row = this.data.curricula.find((c) => c.id === curriculumId);
    if (!row) return false;
    const stale = row.replanStatus === "running" && (!row.replanStartedAt || row.replanStartedAt < staleBeforeIso);
    if (row.replanStatus !== "idle" && !stale) return false;
    row.replanStatus = "running";
    row.replanStartedAt = now();
    return true;
  }

  async applyReplan(input: {
    curriculumId: string;
    insertAt: number;
    lessons: NewLesson[];
    trigger: "struggling" | "excelling";
    diagnosis: unknown;
  }) {
    const curriculum = this.data.curricula.find((c) => c.id === input.curriculumId);
    if (!curriculum) throw new Error("curriculum not found");
    const rows = input.lessons.map((l, i) => this.newLessonRow(input.curriculumId, input.insertAt + i, l));
    for (const l of this.data.lessons) {
      if (l.curriculumId === input.curriculumId && l.position >= input.insertAt) l.position += rows.length;
    }
    this.data.lessons.push(...rows);
    const ids = rows.map((r) => r.id);
    this.data.replanEvents.push({
      id: uuid(),
      curriculumId: input.curriculumId,
      trigger: input.trigger,
      diagnosis: copy(input.diagnosis),
      insertedLessonIds: ids,
      createdAt: now(),
    });
    curriculum.lastReplanAt = now();
    curriculum.replanStatus = "idle";
    curriculum.replanStartedAt = null;
    return ids;
  }

  async releaseReplan(curriculumId: string) {
    const row = this.data.curricula.find((c) => c.id === curriculumId);
    if (row) {
      row.replanStatus = "idle";
      row.replanStartedAt = null;
    }
  }

  async countChunks(bookId: string, sectionIndex: number) {
    return this.data.chunks.filter((c) => c.bookId === bookId && c.sectionIndex === sectionIndex).length;
  }

  async listChunks(bookId: string, sectionIndex: number, limit: number): Promise<ChunkHit[]> {
    return this.data.chunks
      .filter((c) => c.bookId === bookId && c.sectionIndex === sectionIndex)
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .slice(0, limit)
      .map((c) => ({ chunkIndex: c.chunkIndex, content: c.content }));
  }

  async matchChunks(bookId: string, embedding: number[], limit: number, sectionIndex: number | null) {
    return this.data.chunks
      .filter((c) => c.bookId === bookId && (sectionIndex === null || c.sectionIndex === sectionIndex))
      .map((c) => ({ c, score: cosine(c.embedding, embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ c }) => ({ chunkIndex: c.chunkIndex, content: c.content }));
  }

  async insertLlmCall(record: LlmCallRecord) {
    this.data.llmCalls.push({ ...record, id: uuid(), createdAt: now() });
  }

  async countLlmCallsSince(sinceIso: string) {
    return this.data.llmCalls.filter((c) => c.createdAt > sinceIso).length;
  }
}
