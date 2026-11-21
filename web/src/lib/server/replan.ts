import "server-only";
import { z } from "zod";
import type { LessonAttemptSummary } from "@/contracts/ai";
import { QuestionResult, REPLAN_WINDOW, type ReplanTrigger } from "@/contracts/domain";
import { getAi } from "./ai";
import { runInBackground } from "./background";
import { buildLearnerProfile, knownSkillsOf, MAX_NOTES } from "./children";
import { claimLessonForGeneration, generateLessonContent, readContent, STALE_JOB_MS } from "./lessons";
import { cleanDiagnosis, decideReplan, planReplan } from "./replan-plan";
import { getStore } from "./store";
import type { AttemptRow, LessonRow } from "./store/types";
import { cleanText } from "./text";

const NOTES_ATTEMPTS = 5;
const Results = z.array(QuestionResult);

/** Attempt + lesson → what the model sees: the lesson, the score and each wrong answer as text. */
export function summarizeAttempt(attempt: AttemptRow, lesson: LessonRow): LessonAttemptSummary {
  const results = Results.safeParse(attempt.results);
  const content = readContent(lesson);
  const questions = new Map((content?.questions ?? []).map((q) => [q.id, q]));
  const wrongAnswers = (results.success ? results.data : [])
    .filter((r) => !r.correct)
    .map((r) => {
      const q = questions.get(r.questionId);
      return {
        prompt: cleanText(q?.prompt ?? "", 500),
        chosen: cleanText(q?.choices[r.chosenIndex] ?? "", 300),
        correct: cleanText(q?.choices[r.correctIndex] ?? "", 300),
        skill: r.skill,
      };
    });
  return {
    lesson: { title: lesson.title, objective: lesson.objective, skills: lesson.skills },
    score: attempt.score,
    wrongAnswers,
  };
}

/**
 * After an attempt: applies the replan rule and, if it fires and this caller
 * wins the claim, runs the replan in the background. Returns the trigger.
 */
export async function maybeStartReplan(curriculumId: string): Promise<ReplanTrigger | null> {
  const store = getStore();
  const curriculum = await store.getCurriculum(curriculumId);
  if (!curriculum) return null;
  const window = await store.listCurriculumAttempts(curriculumId, curriculum.lastReplanAt, REPLAN_WINDOW);
  const trigger = decideReplan(window.map((a) => a.score));
  if (!trigger) return null;
  const staleBefore = new Date(Date.now() - STALE_JOB_MS).toISOString();
  if (!(await store.claimReplan(curriculumId, staleBefore))) return null;
  runInBackground(`replan ${curriculumId}`, () => runReplan(curriculumId, trigger));
  return trigger;
}

/** The replan job. On any error the curriculum goes back to idle, untouched. */
export async function runReplan(curriculumId: string, trigger: ReplanTrigger): Promise<void> {
  const store = getStore();
  try {
    const curriculum = await store.getCurriculum(curriculumId);
    if (!curriculum) return;
    const [lessons, window, learner] = await Promise.all([
      store.listLessons(curriculumId),
      store.listCurriculumAttempts(curriculumId, curriculum.lastReplanAt, REPLAN_WINDOW),
      buildLearnerProfile(curriculum.childId),
    ]);
    const byId = new Map(lessons.map((l) => [l.id, l]));
    const recentAttempts = [...window]
      .reverse()
      .filter((a) => byId.has(a.lessonId))
      .map((a) => summarizeAttempt(a, byId.get(a.lessonId)!));

    const result = await getAi().replan({
      trigger,
      subject: curriculum.subject,
      learner,
      recentAttempts,
      remainingLessons: lessons
        .filter((l) => !l.completedAt)
        .map((l) => ({ title: l.title, objective: l.objective, skills: l.skills })),
      knownSkills: knownSkillsOf(learner),
    });

    const plan = planReplan({ trigger, lessons, windowAttempts: window, proposed: result.newLessons });
    const ids = await store.applyReplan({
      curriculumId,
      insertAt: plan.insertAt,
      lessons: plan.rows,
      trigger,
      diagnosis: cleanDiagnosis(result.diagnosis),
    });

    // Have the first new lesson ready by the time the child reaches it.
    if (ids[0] && (await claimLessonForGeneration(ids[0]))) await generateLessonContent(ids[0]);
  } catch (err) {
    await store.releaseReplan(curriculumId).catch(() => {});
    throw err;
  }
}

/** Rewrites child.notes from the latest attempts across subjects. */
export async function refreshLearnerNotes(childId: string): Promise<void> {
  const store = getStore();
  const child = await store.getChild(childId);
  if (!child) return;
  const attempts = await store.listChildAttempts(childId, NOTES_ATTEMPTS);
  if (attempts.length === 0) return;

  const recentAttempts = [];
  for (const a of [...attempts].reverse()) {
    const lesson = await store.getLesson(a.lessonId);
    const curriculum = lesson && (await store.getCurriculum(lesson.curriculumId));
    if (lesson && curriculum) recentAttempts.push({ ...summarizeAttempt(a, lesson), subject: curriculum.subject });
  }
  const { notes } = await getAi().updateLearnerNotes({
    previousNotes: cleanText(child.notes, MAX_NOTES),
    gradeLevel: child.gradeLevel,
    recentAttempts,
  });
  await store.updateChildNotes(childId, cleanText(notes, MAX_NOTES));
}

export function startLearnerNotesRefresh(childId: string) {
  runInBackground(`notes ${childId}`, () => refreshLearnerNotes(childId));
}
