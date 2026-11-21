import "server-only";
import type { GetLessonResponse } from "@/contracts/api";
import { CHOICES_PER_QUESTION, LessonContent, SkillSlug, type Question } from "@/contracts/domain";
import { ownedLesson } from "./access";
import { getAi } from "./ai";
import type { AuthUser } from "./auth";
import { runInBackground } from "./background";
import { buildLearnerProfile } from "./children";

import { toLessonSummary } from "./mappers";
import { chunksForLesson } from "./retrieval";
import { getStore } from "./store";
import type { LessonRow } from "./store/types";
import { cleanText, sanitizeMarkdown } from "./text";
import { minutesFromContent } from "./timing";

// A job still 'generating' after this long is treated as dead (ADR 0001).
export const STALE_JOB_MS = 3 * 60 * 1000;
// A failed lesson is retried on open only after this long, so a poller sees
// "failed" and stops instead of retrying the model in a loop.
export const RETRY_COOLDOWN_MS = 60 * 1000;
export const MAX_QUESTIONS = 10;
const MAX_BODY_CHARS = 30_000;
const MAX_PREVIOUS_TITLES = 20;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
/** Claims a lesson for generation; true only for the one caller that wins. */
export const claimLessonForGeneration = (id: string) =>
  getStore().claimLesson(id, ago(STALE_JOB_MS), ago(RETRY_COOLDOWN_MS));
const claim = claimLessonForGeneration;

/** Parses stored content; null if it is missing or malformed. */
export function readContent(row: LessonRow): LessonContent | null {
  if (row.contentStatus !== "ready") return null;
  const parsed = LessonContent.safeParse(row.content);
  return parsed.success ? parsed.data : null;
}

/**
 * Bounds and cleans model-written lesson content (model output is untrusted).
 * Throws if no valid question is left.
 */
export function checkLessonContent(content: LessonContent): LessonContent {
  const seen = new Set<string>();
  const questions: Question[] = [];
  for (const q of content.questions) {
    if (questions.length >= MAX_QUESTIONS) break;
    const choices = q.choices.map((c) => cleanText(c, 300));
    if (choices.length !== CHOICES_PER_QUESTION || choices.some((c) => !c)) continue;
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= CHOICES_PER_QUESTION) continue;
    if (!SkillSlug.safeParse(q.skill).success) continue;
    const prompt = cleanText(q.prompt, 1000);
    if (!prompt) continue;
    const explanation = cleanText(q.explanation, 1000);
    // Feedback per choice; a missing entry falls back to the explanation.
    const choiceFeedback = q.choiceFeedback.map((f) => cleanText(f, 600) || explanation);
    if (choiceFeedback.length !== CHOICES_PER_QUESTION) continue;
    const id = q.id && !seen.has(q.id) ? q.id : crypto.randomUUID();
    seen.add(id);
    questions.push({ id, prompt, choices, correctIndex: q.correctIndex, explanation, choiceFeedback, skill: q.skill });
  }
  if (questions.length === 0) throw new Error("lesson content has no valid questions");
  return LessonContent.parse({ bodyMarkdown: sanitizeMarkdown(content.bodyMarkdown, MAX_BODY_CHARS), questions });
}

/** Generates and stores one claimed lesson. On any error the lesson is marked failed. */
export async function generateLessonContent(lessonId: string): Promise<void> {
  const store = getStore();
  try {
    const lesson = await store.getLesson(lessonId);
    if (!lesson) return;
    const curriculum = await store.getCurriculum(lesson.curriculumId);
    if (!curriculum) return;
    const lessons = await store.listLessons(curriculum.id);
    const [learner, sourceChunks] = await Promise.all([
      buildLearnerProfile(curriculum.childId),
      chunksForLesson(lesson, curriculum, lessons),
    ]);
    const content = await getAi().generateLesson({
      subject: curriculum.subject,
      lesson: { title: lesson.title, objective: lesson.objective, skills: lesson.skills, kind: lesson.kind },
      learner,
      previousLessonTitles: lessons
        .filter((l) => l.position < lesson.position)
        .map((l) => l.title)
        .slice(-MAX_PREVIOUS_TITLES),
      sourceChunks,
    });
    const checked = checkLessonContent(content);
    await store.saveLessonContent(lessonId, checked, minutesFromContent(checked, learner.gradeLevel));
  } catch (err) {
    await store.failLesson(lessonId).catch(() => {});
    throw err;
  }
}

/**
 * Claims a lesson and generates it in the background, then prefetches the
 * next pending lesson so the child rarely waits. Returns whether it claimed.
 * `retryNow` skips the cooldown on failed lessons (explicit "Try again").
 */
export async function startLessonGeneration(lessonId: string, retryNow = false): Promise<boolean> {
  const store = getStore();
  const claimed = retryNow
    ? await store.claimLesson(lessonId, ago(STALE_JOB_MS), new Date().toISOString())
    : await claim(lessonId);
  if (!claimed) return false;
  runInBackground(`lesson ${lessonId}`, async () => {
    await generateLessonContent(lessonId);
    const lesson = await store.getLesson(lessonId);
    if (!lesson || lesson.contentStatus !== "ready") return;
    const next = (await store.listLessons(lesson.curriculumId)).find(
      (l) => l.position > lesson.position && l.contentStatus === "pending",
    );
    if (next && (await claim(next.id))) {
      await generateLessonContent(next.id);
    }
  });
  return true;
}

function needsGeneration(row: LessonRow): boolean {
  const started = row.generationStartedAt;
  if (row.contentStatus === "pending") return true;
  if (row.contentStatus === "failed") return !started || started < ago(RETRY_COOLDOWN_MS);
  return row.contentStatus === "generating" && (!started || started < ago(STALE_JOB_MS));
}

/**
 * GET /lessons/:id. Starts generation when the content is pending, stuck, or
 * failed longer ago than the retry cooldown. Never returns correctIndex or explanation.
 */
export async function getLesson(user: AuthUser, lessonId: string): Promise<GetLessonResponse> {
  const store = getStore();
  let row = (await ownedLesson(user, lessonId)).lesson;
  if (needsGeneration(row) && (await startLessonGeneration(row.id))) {
    row = (await store.getLesson(lessonId)) ?? row;
  }
  return toLessonResponse(row);
}

/** POST /lessons/:id/retry: "Try again" on a failed lesson, without the cooldown. */
export async function retryLesson(user: AuthUser, lessonId: string): Promise<GetLessonResponse> {
  const store = getStore();
  let row = (await ownedLesson(user, lessonId)).lesson;
  const retryable =
    row.contentStatus === "failed" || row.contentStatus === "pending" || needsGeneration(row);
  if (retryable && (await startLessonGeneration(row.id, true))) {
    row = (await store.getLesson(lessonId)) ?? row;
  }
  return toLessonResponse(row);
}

function toLessonResponse(row: LessonRow): GetLessonResponse {
  const content = readContent(row);
  return {
    ...toLessonSummary(row),
    contentStatus: row.contentStatus === "ready" && !content ? "failed" : row.contentStatus,
    content: content && {
      bodyMarkdown: content.bodyMarkdown,
      questions: content.questions.map(({ id, prompt, choices, skill }) => ({ id, prompt, choices, skill })),
    },
  };
}
