import "server-only";
import { z } from "zod";
import type { OutlineOutput } from "@/contracts/ai";
import type { CreateCurriculumRequest, CreateCurriculumResponse } from "@/contracts/api";
import {
  BookSection,
  MAX_CLARIFYING_QUESTIONS,
  type Clarification,
  type Curriculum,
} from "@/contracts/domain";
import { getAi } from "./ai";
import { buildLearnerProfile, knownSkillsOf, requireChild } from "./children";
import { badRequest, conflict, notFound, upstream } from "./errors";
import { startLessonGeneration } from "./lessons";
import { toCurriculum, toCurriculumListItem } from "./mappers";
import { getStore } from "./store";
import type { NewLesson } from "./store/types";
import { cleanText, toSkillSlug } from "./text";

// Limits on what the model may produce for one curriculum (backend-security §3).
export const MAX_OUTLINE_LESSONS = 12;
export const MAX_SKILLS_PER_LESSON = 5;
const MAX_QUESTION_CHARS = 300;
const MAX_ANSWER_CHARS = 500;

export type ValidOutline = { subject: string; title: string; lessons: NewLesson[] };

/**
 * Checks and bounds a model outline. Bad skill slugs are normalized or
 * dropped, section indexes outside the book map become null, extra lessons are
 * cut. Throws if nothing usable is left.
 */
export function validateOutline(outline: OutlineOutput, sections: BookSection[], fallbackTitle: string): ValidOutline {
  const sectionIndexes = new Set(sections.map((s) => s.index));
  const lessons: NewLesson[] = [];
  for (const lesson of outline.lessons) {
    if (lessons.length >= MAX_OUTLINE_LESSONS) break;
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
      bookSectionIndex: index !== null && Number.isInteger(index) && sectionIndexes.has(index) ? index : null,
    });
  }
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

/** Loads a book for planning: must exist and be ready. */
async function bookSectionsFor(bookId: string | null): Promise<BookSection[]> {
  if (!bookId) return [];
  const book = await getStore().getBook(bookId);
  if (!book) throw notFound("Book");
  if (book.status !== "ready") throw conflict("The book is not ready yet.");
  const sections = z.array(BookSection).safeParse(book.sections);
  if (!sections.success) throw new Error(`book ${book.id} has an invalid section map`);
  return sections.data;
}

export async function createCurriculum(body: CreateCurriculumRequest): Promise<CreateCurriculumResponse> {
  const prompt = cleanText(body.prompt, 2000);
  if (!prompt) throw badRequest("Invalid fields: prompt.");
  const clarifications = cleanClarifications(body.clarifications);

  await requireChild(body.childId);
  const bookSections = await bookSectionsFor(body.bookId);
  const learner = await buildLearnerProfile(body.childId);

  const result = await getAi().generateOutline({
    prompt,
    clarifications,
    learner,
    knownSkills: knownSkillsOf(learner),
    bookSections,
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

  const outline = validateOutline(result.outline, bookSections, prompt);
  const store = getStore();
  const id = await store.createCurriculum({
    childId: body.childId,
    bookId: body.bookId,
    prompt,
    subject: outline.subject,
    title: outline.title,
    lessons: outline.lessons,
  });
  const [first] = await store.listLessons(id);
  if (first) await startLessonGeneration(first.id);
  return { status: "created", curriculum: await getCurriculum(id) };
}

export async function listCurricula(childId: string) {
  await requireChild(childId);
  return (await getStore().listCurricula(childId)).map(toCurriculumListItem);
}

export async function getCurriculum(id: string): Promise<Curriculum> {
  const store = getStore();
  const row = await store.getCurriculum(id);
  if (!row) throw notFound("Curriculum");
  const [lessons, events] = await Promise.all([store.listLessons(id), store.listReplanEvents(id)]);
  return toCurriculum(row, lessons, events);
}
