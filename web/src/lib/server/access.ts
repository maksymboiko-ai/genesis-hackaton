import "server-only";
import type { AuthUser } from "./auth";
import { notFound } from "./errors";
import { getStore } from "./store";
import type { BookRow, ChildRow, CurriculumRow, LessonRow } from "./store/types";

// Ownership checks. A parent reaches a curriculum, lesson or attempt only
// through a child they own. Anything else answers "not found", so ids of
// other families' data cannot even be confirmed to exist.

export async function ownedChild(user: AuthUser, childId: string): Promise<ChildRow> {
  const child = await getStore().getChild(childId);
  if (!child || child.ownerId !== user.id) throw notFound("Child");
  return child;
}

export async function ownedBook(user: AuthUser, bookId: string): Promise<BookRow> {
  const book = await getStore().getBook(bookId);
  if (!book || book.ownerId !== user.id) throw notFound("Book");
  return book;
}

export async function ownedCurriculum(user: AuthUser, curriculumId: string): Promise<{ curriculum: CurriculumRow; child: ChildRow }> {
  const store = getStore();
  const curriculum = await store.getCurriculum(curriculumId);
  const child = curriculum && (await store.getChild(curriculum.childId));
  if (!curriculum || !child || child.ownerId !== user.id) throw notFound("Curriculum");
  return { curriculum, child };
}

export async function ownedLesson(
  user: AuthUser,
  lessonId: string,
): Promise<{ lesson: LessonRow; curriculum: CurriculumRow; child: ChildRow }> {
  const store = getStore();
  const lesson = await store.getLesson(lessonId);
  const curriculum = lesson && (await store.getCurriculum(lesson.curriculumId));
  const child = curriculum && (await store.getChild(curriculum.childId));
  if (!lesson || !curriculum || !child || child.ownerId !== user.id) throw notFound("Lesson");
  return { lesson, curriculum, child };
}
