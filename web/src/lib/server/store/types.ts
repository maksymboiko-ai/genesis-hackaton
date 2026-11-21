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

export type BookRow = {
  id: string;
  title: string;
  storagePath: string;
  status: "processing" | "ready" | "failed";
  // BookSection[] (jsonb).
  sections: unknown;
};

export type CurriculumRow = {
  id: string;
  childId: string;
  bookId: string | null;
  prompt: string;
  subject: string;
  title: string;
  replanStatus: "idle" | "running";
  lastReplanAt: string | null;
  replanStartedAt: string | null;
  createdAt: string;
};

export type LessonKind = "core" | "remedial" | "retry" | "extension";
export type ContentStatus = "pending" | "generating" | "ready" | "failed";

export type LessonRow = {
  id: string;
  curriculumId: string;
  position: number;
  kind: LessonKind;
  title: string;
  objective: string;
  skills: string[];
  retryOfLessonId: string | null;
  contentStatus: ContentStatus;
  // LessonContent (jsonb), null until ready.
  content: unknown;
  completedAt: string | null;
  lastScore: number | null;
  bookSectionIndex: number | null;
  generationStartedAt: string | null;
  createdAt: string;
};

export type ReplanEventRow = {
  id: string;
  curriculumId: string;
  trigger: "struggling" | "excelling";
  // ReplanDiagnosis (jsonb).
  diagnosis: unknown;
  insertedLessonIds: string[];
  createdAt: string;
};

/** A lesson to insert; position and curriculum are decided by the store. */
export type NewLesson = {
  kind: LessonKind;
  title: string;
  objective: string;
  skills: string[];
  retryOfLessonId: string | null;
  bookSectionIndex: number | null;
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

  // --- book (read side; writes come with the books module) ---
  getBook(id: string): Promise<BookRow | null>;

  // --- curriculum, lesson, replan_event ---
  /** Inserts the curriculum and its core lessons in one transaction. */
  createCurriculum(input: {
    childId: string;
    bookId: string | null;
    prompt: string;
    subject: string;
    title: string;
    lessons: NewLesson[];
  }): Promise<string>;
  /** Newest first. */
  listCurricula(childId: string): Promise<CurriculumRow[]>;
  getCurriculum(id: string): Promise<CurriculumRow | null>;
  /** Ordered by position. */
  listLessons(curriculumId: string): Promise<LessonRow[]>;
  /** Oldest first. */
  listReplanEvents(curriculumId: string): Promise<ReplanEventRow[]>;

  // --- llm_call ---
  insertLlmCall(record: LlmCallRecord): Promise<void>;
  countLlmCallsSince(sinceIso: string): Promise<number>;
}
