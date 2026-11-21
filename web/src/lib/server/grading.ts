import "server-only";
import type { SubmitAttemptRequest } from "@/contracts/api";
import {
  CHOICES_PER_QUESTION,
  MASTERY_ALPHA,
  MASTERY_START,
  type LessonContent,
  type QuestionResult,
} from "@/contracts/domain";
import { badRequest } from "./errors";

// Grading and mastery are plain code: "code decides when, models decide what".

/**
 * Grades answers against the stored content. Every question must be answered
 * exactly once; unknown, duplicate or out-of-range answers are rejected.
 */
export function gradeAttempt(
  content: LessonContent,
  answers: SubmitAttemptRequest["answers"],
): { score: number; results: QuestionResult[] } {
  const byId = new Map<string, number>();
  const known = new Set(content.questions.map((q) => q.id));
  for (const a of answers) {
    if (!known.has(a.questionId)) throw badRequest("An answer refers to an unknown question.");
    if (byId.has(a.questionId)) throw badRequest("A question was answered more than once.");
    if (a.chosenIndex >= CHOICES_PER_QUESTION) throw badRequest("An answer index is out of range.");
    byId.set(a.questionId, a.chosenIndex);
  }
  if (byId.size !== content.questions.length) throw badRequest("Every question must be answered.");

  const results = content.questions.map((q) => {
    const chosenIndex = byId.get(q.id)!;
    return {
      questionId: q.id,
      skill: q.skill,
      chosenIndex,
      correctIndex: q.correctIndex,
      correct: chosenIndex === q.correctIndex,
      // Feedback for the choice the child picked: what went right, or the
      // slip behind it and the right way.
      explanation: q.choiceFeedback[chosenIndex] || q.explanation,
    };
  });
  return { score: results.filter((r) => r.correct).length / results.length, results };
}

/** Share of each skill's questions answered correctly. */
export function skillScores(results: QuestionResult[]): Map<string, number> {
  const totals = new Map<string, { right: number; all: number }>();
  for (const r of results) {
    const t = totals.get(r.skill) ?? { right: 0, all: 0 };
    t.all += 1;
    if (r.correct) t.right += 1;
    totals.set(r.skill, t);
  }
  return new Map([...totals].map(([skill, t]) => [skill, t.right / t.all]));
}

/** mastery = (1 - MASTERY_ALPHA) * mastery + MASTERY_ALPHA * skillScore */
export function nextMastery(previous: number | undefined, skillScore: number): number {
  const value = (1 - MASTERY_ALPHA) * (previous ?? MASTERY_START) + MASTERY_ALPHA * skillScore;
  return Math.min(1, Math.max(0, value));
}
