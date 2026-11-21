import "server-only";
import type { LessonContentInput, QuestionResult } from "@/contracts/domain";
import { getAi } from "./ai";
import { summarizeAttempt } from "./replan";
import type { AttemptRow, LessonRow } from "./store/types";
import { cleanText } from "./text";

// The message above the quiz results. Written by the model while the attempt
// is submitted; if the model is slow or fails, a plain message from the
// score is used, so submitting never fails because of it.

export type AttemptFeedback = { headline: string; summary: string };

export const FEEDBACK_TIMEOUT_MS = 8000;

/** Plain message from the score alone. */
export function fallbackFeedback(results: QuestionResult[]): AttemptFeedback {
  const total = results.length;
  const right = results.filter((r) => r.correct).length;
  const misses = total - right;
  if (misses === 0) return { headline: "All of them held up.", summary: `${right} of ${total}. Nothing to look at again.` };
  const again = misses === 1 ? "One to look at again, below." : `${misses} to look at again, below.`;
  if (right / total >= 0.6) return { headline: "Nice work.", summary: `${right} of ${total}. ${again}` };
  return {
    headline: "This one was tricky. That's useful to know.",
    summary: `${right} of ${total}. The notes below show where it slipped.`,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("feedback timed out")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function attemptFeedback(input: {
  lesson: LessonRow;
  content: LessonContentInput;
  results: QuestionResult[];
  score: number;
  subject: string;
  gradeLevel: number;
}): Promise<AttemptFeedback> {
  const fallback = fallbackFeedback(input.results);
  try {
    const attempt: AttemptRow = { id: "", lessonId: input.lesson.id, score: input.score, results: input.results, createdAt: "" };
    const byId = new Map(input.content.questions.map((q) => [q.id, q]));
    const rightAnswers = input.results
      .filter((r) => r.correct)
      .map((r) => {
        const q = byId.get(r.questionId);
        return { prompt: cleanText(q?.prompt ?? "", 500), answer: cleanText(q?.choices[r.chosenIndex] ?? "", 300), skill: r.skill };
      });
    const out = await withTimeout(
      getAi().writeAttemptFeedback({
        gradeLevel: input.gradeLevel,
        subject: input.subject,
        attempt: summarizeAttempt(attempt, input.lesson),
        rightAnswers,
      }),
      FEEDBACK_TIMEOUT_MS,
    );
    const headline = cleanText(out.headline, 120);
    const summary = cleanText(out.summary, 400);
    return headline && summary ? { headline, summary } : fallback;
  } catch (err) {
    console.error("[feedback] using the fallback", err instanceof Error ? err.message : err);
    return fallback;
  }
}
