import "server-only";
import { EMBEDDING_DIMENSIONS } from "@/contracts/ai";
import { LESSON_CHUNK_LIMIT } from "@/contracts/domain";
import { getAi } from "./ai";
import { getStore } from "./store";
import type { ChunkHit, CurriculumRow, LessonRow } from "./store/types";
import { cleanText } from "./text";

// Book text is untrusted input to the lesson prompt: cap each excerpt.
const MAX_CHUNK_CHARS = 2500;

/** The section a lesson is taught from; a retry keeps its original's section. */
export function sectionFor(lesson: LessonRow, lessons: LessonRow[]): number | null {
  if (lesson.bookSectionIndex !== null) return lesson.bookSectionIndex;
  if (lesson.kind === "retry" && lesson.retryOfLessonId) {
    return lessons.find((l) => l.id === lesson.retryOfLessonId)?.bookSectionIndex ?? null;
  }
  return null;
}

export function assertEmbedding(v: unknown): asserts v is number[] {
  if (!Array.isArray(v) || v.length !== EMBEDDING_DIMENSIONS || !v.every((x) => typeof x === "number" && Number.isFinite(x))) {
    throw new Error("embedding has the wrong shape");
  }
}

/**
 * Book excerpts for one lesson, in reading order (ARCHITECTURE "Textbook
 * grounding"): a small section is passed whole; a large one, or a lesson with
 * no section, is searched by the lesson's title and objective.
 */
export async function chunksForLesson(
  lesson: LessonRow,
  curriculum: CurriculumRow,
  lessons: LessonRow[],
): Promise<string[]> {
  if (!curriculum.bookId) return [];
  const store = getStore();
  const book = await store.getBook(curriculum.bookId);
  if (!book || book.status !== "ready") return [];

  const section = sectionFor(lesson, lessons);
  let hits: ChunkHit[];
  if (section !== null && (await store.countChunks(book.id, section)) <= LESSON_CHUNK_LIMIT) {
    hits = await store.listChunks(book.id, section, LESSON_CHUNK_LIMIT);
  } else {
    const [embedding] = await getAi().embed([`${lesson.title}\n${lesson.objective}`]);
    assertEmbedding(embedding);
    hits = await store.matchChunks(book.id, embedding, LESSON_CHUNK_LIMIT, section);
  }
  return [...hits]
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((h) => cleanText(h.content, MAX_CHUNK_CHARS))
    .filter(Boolean);
}
