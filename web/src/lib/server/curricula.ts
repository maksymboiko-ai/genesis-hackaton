import "server-only";
import { z } from "zod";
import type { OutlineLesson, OutlineOutput } from "@/contracts/ai";
import type { CreateCurriculumRequest, CreateCurriculumResponse } from "@/contracts/api";
import { findGradeSubject, gradeSubjectFor, subjectsForGrade } from "@/contracts/subjects";
import {
  BookSection,
  MAX_CLARIFYING_QUESTIONS,
  MAX_CURRICULUM_LESSONS,
  MAX_EXTEND_LESSONS,
  MAX_OUTLINE_LESSONS,
  type Clarification,
  type Curriculum,
} from "@/contracts/domain";
import { ownedBook, ownedChild, ownedCurriculum } from "./access";
import { getAi } from "./ai";
import type { AuthUser } from "./auth";
import { buildLearnerProfile, knownSkillsOf } from "./children";
import { badRequest, conflict, notFound, upstream } from "./errors";
import { startLessonGeneration, STALE_JOB_MS } from "./lessons";
import { toCurriculum, toCurriculumListItem } from "./mappers";
import { getStore } from "./store";
import type { NewLesson } from "./store/types";
import { cleanText, toSkillSlug } from "./text";
import { cleanMinutes, fallbackMinutes } from "./timing";

// Limits on what the model may produce for one curriculum (backend-security §3).
export { MAX_OUTLINE_LESSONS };
export const MAX_SKILLS_PER_LESSON = 5;
const MAX_QUESTION_CHARS = 300;
const MAX_ANSWER_CHARS = 500;

export type ValidOutline = { subject: string; title: string; lessons: NewLesson[] };

/**
 * Checks and bounds the lessons of a model outline. Bad skill slugs are
 * normalized or dropped, section indexes outside the book map become null,
 * lessons past `max` are cut.
 */
function validateLessons(planned: OutlineLesson[], sections: BookSection[], gradeLevel: number, max: number): NewLesson[] {
  const sectionIndexes = new Set(sections.map((s) => s.index));
  const estimates = planned.map((l) => l.estimatedMinutes);
  const fallback = fallbackMinutes(estimates, gradeLevel);
  const lessons: NewLesson[] = [];
  for (const lesson of planned) {
    if (lessons.length >= max) break;
    const title = cleanText(lesson.title, 150);
    const objective = cleanText(lesson.objective, 500);
    if (!title || !objective) continue;
    const skills = [...new Set(lesson.skills.map(toSkillSlug).filter((s): s is string => s !== null))].slice(
      0,
      MAX_SKILLS_PER_LESSON,
    );
    if (skills.length === 0) skills.push(toSkillSlug(title) ?? "general");
    const index = lesson.bookSectionIndex;
    lessons.push({
      kind: "core",
      title,
      objective,
      skills,
      retryOfLessonId: null,
      reason: null,
      estimatedMinutes: cleanMinutes(lesson.estimatedMinutes, fallback),
      bookSectionIndex: index !== null && Number.isInteger(index) && sectionIndexes.has(index) ? index : null,
    });
  }
  return lessons;
}

/** Checks and bounds a model outline. Throws if nothing usable is left. */
export function validateOutline(
  outline: OutlineOutput,
  sections: BookSection[],
  fallbackTitle: string,
  gradeLevel: number,
): ValidOutline {
  const lessons = validateLessons(outline.lessons, sections, gradeLevel, MAX_OUTLINE_LESSONS);
  if (lessons.length === 0) throw upstream("The AI returned an empty plan. Try again.");
  return {
    subject: cleanText(outline.subject, 80) || "General",
    title: cleanText(outline.title, 120) || cleanText(fallbackTitle, 120),
    lessons,
  };
}

function cleanClarifications(items: Clarification[]): Clarification[] {
  return items
    .map((c) => ({ question: cleanText(c.question, MAX_QUESTION_CHARS), answer: cleanText(c.answer, MAX_ANSWER_CHARS) }))
    .filter((c) => c.question && c.answer);
}

/** Loads a book for planning: must be the parent's own and ready. */
async function bookSectionsFor(user: AuthUser, bookId: string | null): Promise<BookSection[]> {
  if (!bookId) return [];
  const book = await ownedBook(user, bookId);
  if (book.status !== "ready") throw conflict("The book is not ready yet.");
  const sections = z.array(BookSection).safeParse(book.sections);
  if (!sections.success) throw new Error(`book ${book.id} has an invalid section map`);
  return sections.data;
}

export async function createCurriculum(user: AuthUser, body: CreateCurriculumRequest): Promise<CreateCurriculumResponse> {
  const prompt = cleanText(body.prompt, 2000);
  if (!prompt) throw badRequest("Invalid fields: prompt.");
  const clarifications = cleanClarifications(body.clarifications);

  const child = await ownedChild(user, body.childId);
  const picked = body.subject ? findGradeSubject(child.gradeLevel, body.subject) : null;
  if (body.subject && !picked) throw badRequest(`Invalid fields: subject is not a grade ${child.gradeLevel} subject.`);
  const bookSections = await bookSectionsFor(user, body.bookId);
  const learner = await buildLearnerProfile(body.childId);

  const result = await getAi().generateOutline({
    prompt,
    clarifications,
    learner,
    knownSkills: knownSkillsOf(learner),
    bookSections,
    subjects: subjectsForGrade(child.gradeLevel).map((subject) => subject.name),
    subject: picked?.name ?? null,
  });

  if (result.kind === "questions") {
    const questions = result.questions
      .map((q) => cleanText(q, MAX_QUESTION_CHARS))
      .filter(Boolean)
      .slice(0, MAX_CLARIFYING_QUESTIONS);
    // One round at most: with answers present the contract promises an outline.
    if (clarifications.length > 0 || questions.length === 0) {
      throw upstream("The AI could not build a plan. Try rephrasing the goal.");
    }
    return { status: "needs_clarification", questions };
  }

  const outline = validateOutline(result.outline, bookSections, prompt, learner.gradeLevel);
  const store = getStore();
  const id = await store.createCurriculum({
    childId: body.childId,
    bookId: body.bookId,
    prompt,
    // The model may drift from the list: map it back onto the grade.
    subject: picked?.name ?? gradeSubjectFor(child.gradeLevel, outline.subject).name,
    title: outline.title,
    lessons: outline.lessons,
  });
  const [first] = await store.listLessons(id);
  if (first) await startLessonGeneration(first.id);
  return { status: "created", curriculum: await getCurriculum(id) };
}

/** The map of a plan's book, or [] when the book is gone or not ready. */
async function bookSectionsIfReady(user: AuthUser, bookId: string | null): Promise<BookSection[]> {
  if (!bookId) return [];
  const book = await getStore().getBook(bookId);
  if (!book || book.ownerId !== user.id || book.status !== "ready") return [];
  const sections = z.array(BookSection).safeParse(book.sections);
  return sections.success ? sections.data : [];
}

/**
 * POST /curricula/:id/extend. The child finished the plan and wants more:
 * plans the next lessons from the plan so far and appends them. The replan
 * claim serializes this with replans and with a second press of the button.
 */
export async function extendCurriculum(user: AuthUser, id: string): Promise<Curriculum> {
  const { curriculum } = await ownedCurriculum(user, id);
  const store = getStore();
  const staleBefore = new Date(Date.now() - STALE_JOB_MS).toISOString();
  if (!(await store.claimReplan(id, staleBefore))) throw conflict("The plan is being updated. Try again in a moment.");
  try {
    const lessons = await store.listLessons(id);
    if (lessons.some((l) => !l.completedAt)) throw conflict("Finish the lessons in the plan first.");
    const room = MAX_CURRICULUM_LESSONS - lessons.length;
    if (room <= 0) throw conflict("This plan is as long as a plan can be. Start a new one to keep going.");
    const maxLessons = Math.min(MAX_EXTEND_LESSONS, room);

    const [learner, bookSections] = await Promise.all([
      buildLearnerProfile(curriculum.childId),
      bookSectionsIfReady(user, curriculum.bookId),
    ]);
    const result = await getAi().extendOutline({
      prompt: curriculum.prompt,
      subject: curriculum.subject,
      title: curriculum.title,
      lessons: lessons.map((l) => ({
        title: l.title,
        objective: l.objective,
        skills: l.skills,
        kind: l.kind,
        score: l.lastScore,
        bookSectionIndex: l.bookSectionIndex,
      })),
      learner,
      knownSkills: knownSkillsOf(learner),
      bookSections,
      maxLessons,
    });

    // The model is told not to repeat a lesson; a repeat that slips through is dropped.
    const taken = new Set(lessons.map((l) => l.title.trim().toLowerCase()));
    const added = validateLessons(result.lessons, bookSections, learner.gradeLevel, maxLessons).filter(
      (l) => !taken.has(l.title.toLowerCase()),
    );
    if (added.length === 0) throw upstream("The AI could not plan more lessons. Try again.");
    const [first] = await store.appendLessons(id, added);
    await store.releaseReplan(id);
    if (first) await startLessonGeneration(first);
  } catch (err) {
    await store.releaseReplan(id).catch(() => {});
    throw err;
  }
  return getCurriculum(id);
}

export async function listCurricula(user: AuthUser, childId: string) {
  await ownedChild(user, childId);
  return (await getStore().listCurricula(childId)).map(toCurriculumListItem);
}

/** GET /curricula/:id for the signed-in parent. */
export async function getOwnedCurriculum(user: AuthUser, id: string): Promise<Curriculum> {
  await ownedCurriculum(user, id);
  return getCurriculum(id);
}

export async function getCurriculum(id: string): Promise<Curriculum> {
  const store = getStore();
  const row = await store.getCurriculum(id);
  if (!row) throw notFound("Curriculum");
  const [lessons, events] = await Promise.all([store.listLessons(id), store.listReplanEvents(id)]);
  return toCurriculum(row, lessons, events);
}
