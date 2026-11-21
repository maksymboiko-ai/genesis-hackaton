import "server-only";
import type { PlannedLesson } from "@/contracts/ai";
import {
  EXCELLING_FROM,
  REPLAN_WINDOW,
  STRUGGLING_BELOW,
  type ReplanDiagnosis,
  type ReplanTrigger,
} from "@/contracts/domain";
import { sectionFor } from "./retrieval";
import type { LessonRow, NewLesson } from "./store/types";
import { cleanText, toSkillSlug } from "./text";

// Pure replan logic: when to replan and where new lessons go.

// Lessons the model may add in one replan (model output is untrusted).
export const MAX_REPLAN_LESSONS = 4;
const MAX_REASON_CHARS = 200;
// Retries are added by code, so their reason is too.
export const RETRY_REASON = "A second try at this lesson, now that the review lessons are behind you.";

/**
 * The replan rule. `scores` are the attempts since the last replan, newest
 * first. Only a full window counts.
 */
export function decideReplan(scores: number[]): ReplanTrigger | null {
  if (scores.length < REPLAN_WINDOW) return null;
  const window = scores.slice(0, REPLAN_WINDOW);
  const mean = window.reduce((s, x) => s + x, 0) / window.length;
  if (mean < STRUGGLING_BELOW) return "struggling";
  if (mean >= EXCELLING_FROM) return "excelling";
  return null;
}

export function cleanDiagnosis(d: ReplanDiagnosis): ReplanDiagnosis {
  return {
    summary: cleanText(d.summary, 1000),
    childMessage: cleanText(d.childMessage, 400),
    mistakes: d.mistakes.map((m) => cleanText(m, 300)).filter(Boolean).slice(0, 10),
    missingSkills: [...new Set(d.missingSkills.map(toSkillSlug).filter((s): s is string => s !== null))].slice(0, 10),
  };
}

function cleanOutline(l: PlannedLesson, kind: "remedial" | "extension"): NewLesson | null {
  const title = cleanText(l.title, 150);
  const objective = cleanText(l.objective, 500);
  if (!title || !objective) return null;
  const skills = [...new Set(l.skills.map(toSkillSlug).filter((s): s is string => s !== null))].slice(0, 5);
  if (skills.length === 0) skills.push(toSkillSlug(title) ?? "general");
  const reason = cleanText(l.reason, MAX_REASON_CHARS) || null;
  return { kind, title, objective, skills, retryOfLessonId: null, bookSectionIndex: null, reason };
}

/**
 * Where the new lessons go (ARCHITECTURE "Self-healing"):
 * - struggling: remedial lessons, then a retry of each failed lesson in the
 *   window, inserted before the next lesson the child has not done yet;
 * - excelling: extension lessons appended at the end.
 */
export function planReplan(input: {
  trigger: ReplanTrigger;
  lessons: LessonRow[];
  windowAttempts: { lessonId: string; score: number }[];
  proposed: PlannedLesson[];
}): { insertAt: number; rows: NewLesson[] } {
  const ordered = [...input.lessons].sort((a, b) => a.position - b.position);
  const end = ordered.length ? ordered[ordered.length - 1].position + 1 : 0;

  if (input.trigger === "excelling") {
    const rows = input.proposed
      .map((l) => cleanOutline(l, "extension"))
      .filter((l): l is NewLesson => l !== null)
      .slice(0, MAX_REPLAN_LESSONS);
    return { insertAt: end, rows };
  }

  const remedial = input.proposed
    .map((l) => cleanOutline(l, "remedial"))
    .filter((l): l is NewLesson => l !== null)
    .slice(0, MAX_REPLAN_LESSONS);

  const failedIds = new Set(input.windowAttempts.filter((a) => a.score < STRUGGLING_BELOW).map((a) => a.lessonId));
  const retries: NewLesson[] = ordered
    .filter((l) => failedIds.has(l.id))
    .map((l) => ({
      kind: "retry",
      title: l.title,
      objective: l.objective,
      skills: l.skills,
      retryOfLessonId: l.id,
      bookSectionIndex: sectionFor(l, ordered),
      reason: RETRY_REASON,
    }));

  const next = ordered.find((l) => !l.completedAt);
  return { insertAt: next ? next.position : end, rows: [...remedial, ...retries] };
}
