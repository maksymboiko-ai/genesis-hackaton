import "server-only";
import type { SubmitAttemptRequest, SubmitAttemptResponse } from "@/contracts/api";
import { ownedLesson } from "./access";
import type { AuthUser } from "./auth";
import { conflict } from "./errors";
import { attemptFeedback } from "./feedback";
import { gradeAttempt, nextMastery, skillScores } from "./grading";
import { readContent } from "./lessons";
import { maybeStartReplan, startLearnerNotesRefresh } from "./replan";
import { getStore } from "./store";
import { recordActivity } from "./streak";

/**
 * POST /lessons/:id/attempts. Grades in code, stores the attempt, completes
 * the lesson and updates mastery in one transaction, then responds.
 */
export async function submitAttempt(
  user: AuthUser,
  lessonId: string,
  body: SubmitAttemptRequest,
  timeZone = "UTC",
): Promise<SubmitAttemptResponse> {
  const store = getStore();
  const { lesson, curriculum, child } = await ownedLesson(user, lessonId);
  const content = readContent(lesson);
  if (!content) throw conflict("The lesson is not ready yet.");

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
  // Any finished quiz counts the day toward the streak, retakes included.
  await recordActivity(curriculum.childId, timeZone);

  const lessons = await store.listLessons(curriculum.id);
  const next = lessons.find((l) => !l.completedAt);
  const feedback = await attemptFeedback({
    lesson,
    content,
    results,
    score,
    subject: curriculum.subject,
    gradeLevel: child.gradeLevel,
  });

  // Code decides when to replan; the replan and the notes run after the response.
  const replanTriggered = await maybeStartReplan(curriculum.id);
  startLearnerNotesRefresh(curriculum.childId);

  return { attemptId, score, results, feedback, replanTriggered, nextLessonId: next?.id ?? null };
}
