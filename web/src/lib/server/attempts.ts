import "server-only";
import type { SubmitAttemptRequest, SubmitAttemptResponse } from "@/contracts/api";
import { conflict, notFound } from "./errors";
import { gradeAttempt, nextMastery, skillScores } from "./grading";
import { readContent } from "./lessons";
import { getStore } from "./store";

/**
 * POST /lessons/:id/attempts. Grades in code, stores the attempt, completes
 * the lesson and updates mastery in one transaction, then responds.
 */
export async function submitAttempt(lessonId: string, body: SubmitAttemptRequest): Promise<SubmitAttemptResponse> {
  const store = getStore();
  const lesson = await store.getLesson(lessonId);
  if (!lesson) throw notFound("Lesson");
  const content = readContent(lesson);
  if (!content) throw conflict("The lesson is not ready yet.");
  const curriculum = await store.getCurriculum(lesson.curriculumId);
  if (!curriculum) throw notFound("Curriculum");

  const { score, results } = gradeAttempt(content, body.answers);

  const current = new Map(
    (await store.listMastery(curriculum.childId))
      .filter((m) => m.subject === curriculum.subject)
      .map((m) => [m.skill, m.mastery]),
  );
  const mastery = [...skillScores(results)].map(([skill, s]) => ({ skill, mastery: nextMastery(current.get(skill), s) }));

  const attemptId = await store.recordAttempt({
    lessonId,
    score,
    results,
    childId: curriculum.childId,
    subject: curriculum.subject,
    mastery,
  });

  const lessons = await store.listLessons(curriculum.id);
  const next = lessons.find((l) => !l.completedAt);

  return { attemptId, score, results, replanTriggered: null, nextLessonId: next?.id ?? null };
}
