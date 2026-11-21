import "server-only";
import type { LessonContent } from "@/contracts/domain";

// Lesson length in minutes (LessonSummary.estimatedMinutes). Before a lesson
// is written, the model's estimate from the outline is used; once the content
// exists, the estimate is computed from it.

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 60;
// Time to answer one multiple-choice question, in minutes.
const MINUTES_PER_QUESTION = 0.75;

/** Silent reading speed by grade, words per minute (conservative, for children). */
export function wordsPerMinute(gradeLevel: number): number {
  if (gradeLevel <= 2) return 60;
  if (gradeLevel <= 4) return 90;
  if (gradeLevel <= 8) return 140;
  return 180;
}

const clamp = (v: number) => Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(v)));

/** Minutes from the written lesson: reading the body plus answering the quiz. */
export function minutesFromContent(content: LessonContent, gradeLevel: number): number {
  const text = content.bodyMarkdown.replace(/[#*_`>\-[\]()]/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return clamp(Math.ceil(words / wordsPerMinute(gradeLevel) + content.questions.length * MINUTES_PER_QUESTION));
}

/** The model's estimate, bounded; `fallback` when it is not a usable number. */
export function cleanMinutes(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? clamp(value) : clamp(fallback);
}

/**
 * Estimate for a lesson the model gave no usable number for: the average of
 * the other lessons in the same plan, else a typical lesson at this grade
 * (about 350 words and 4 or 5 questions).
 */
export function fallbackMinutes(others: number[], gradeLevel: number): number {
  const valid = others.filter((m) => Number.isFinite(m) && m > 0);
  if (valid.length) return clamp(valid.reduce((s, m) => s + m, 0) / valid.length);
  const questions = gradeLevel <= 4 ? 4 : 5;
  return clamp(Math.ceil(350 / wordsPerMinute(gradeLevel) + questions * MINUTES_PER_QUESTION));
}
