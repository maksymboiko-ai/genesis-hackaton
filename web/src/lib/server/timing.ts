import "server-only";
import type { LessonContentInput } from "@/contracts/domain";

// Lesson length in minutes (LessonSummary.estimatedMinutes). Before a lesson
// is written, the model's estimate from the outline is used; once the content
// exists, the estimate is computed from it.

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 60;
// Time to answer one multiple-choice question, in minutes.
const MINUTES_PER_QUESTION = 0.75;
// Time spent on one interactive block: trying a graph, answering a check,
// stepping through an example.
const MINUTES_PER_BLOCK = 0.75;

/** Silent reading speed by grade, words per minute (conservative, for children). */
export function wordsPerMinute(gradeLevel: number): number {
  if (gradeLevel <= 2) return 60;
  if (gradeLevel <= 4) return 90;
  if (gradeLevel <= 8) return 140;
  return 180;
}

const clamp = (v: number) => Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(v)));

/** Minutes from the written lesson: reading the body, working the blocks, answering the quiz. */
export function minutesFromContent(content: LessonContentInput, gradeLevel: number): number {
  const blocks = content.blocks ?? [];
  // A stepped example is read too; its words count with the body.
  const stepped = blocks.flatMap((b) => (b.type === "steps" ? b.steps.map((s) => `${s.text} ${s.math}`) : []));
  const text = [content.bodyMarkdown.replace(/\[\[[a-z0-9-]+\]\]/g, " "), ...stepped].join(" ").replace(/[#*_`>\-[\]()]/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return clamp(
    Math.ceil(
      words / wordsPerMinute(gradeLevel) +
        blocks.length * MINUTES_PER_BLOCK +
        content.questions.length * MINUTES_PER_QUESTION,
    ),
  );
}

/** The model's estimate, bounded; `fallback` when it is not a usable number. */
export function cleanMinutes(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? clamp(value) : clamp(fallback);
}

/**
 * Estimate for a lesson the model gave no usable number for: the average of
 * the other lessons in the same plan, else a typical lesson at this grade
 * (about 700 words, a few blocks and 5 to 7 questions).
 */
export function fallbackMinutes(others: number[], gradeLevel: number): number {
  const valid = others.filter((m) => Number.isFinite(m) && m > 0);
  if (valid.length) return clamp(valid.reduce((s, m) => s + m, 0) / valid.length);
  const questions = gradeLevel <= 4 ? 5 : 7;
  return clamp(Math.ceil(700 / wordsPerMinute(gradeLevel) + 4 * MINUTES_PER_BLOCK + questions * MINUTES_PER_QUESTION));
}
