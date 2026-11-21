import "server-only";
import {
  ReplanDiagnosis,
  SkillSlug,
  type Curriculum,
  type LessonSummary,
  type ReplanEvent,
} from "@/contracts/domain";
import { lessonLocked } from "@/lib/access";
import type { CurriculumRow, LessonRow, ReplanEventRow } from "./store/types";

// Store rows → contract shapes. Responses are parsed through the contract
// schemas again in ok(), so these only adapt names and formats.

/** Postgres returns "+00:00"; the contracts want ISO with "Z". */
export const iso = (value: string): string => new Date(value).toISOString();

const validSkills = (skills: string[]) => skills.filter((s) => SkillSlug.safeParse(s).success);

/** Questions in a written lesson's quiz, read without parsing the whole content. */
function questionCount(row: LessonRow): number | null {
  if (row.contentStatus !== "ready") return null;
  const questions = (row.content as { questions?: unknown } | null)?.questions;
  return Array.isArray(questions) && questions.length > 0 ? questions.length : null;
}

/** `fullAccess`: the account has a running trial or has paid (see lib/access.ts). */
export function toLessonSummary(row: LessonRow, fullAccess: boolean): LessonSummary {
  return {
    id: row.id,
    curriculumId: row.curriculumId,
    position: row.position,
    kind: row.kind,
    title: row.title,
    objective: row.objective,
    skills: validSkills(row.skills),
    retryOfLessonId: row.retryOfLessonId,
    reason: row.reason,
    estimatedMinutes: row.estimatedMinutes,
    contentStatus: row.contentStatus,
    questionCount: questionCount(row),
    completedAt: row.completedAt ? iso(row.completedAt) : null,
    lastScore: row.lastScore,
    locked: lessonLocked(row.position, fullAccess),
  };
}

export function toReplanEvent(row: ReplanEventRow): ReplanEvent {
  const diagnosis = ReplanDiagnosis.safeParse(row.diagnosis);
  return {
    id: row.id,
    curriculumId: row.curriculumId,
    trigger: row.trigger,
    diagnosis: diagnosis.success ? diagnosis.data : { summary: "", childMessage: "", mistakes: [], missingSkills: [] },
    insertedLessonIds: row.insertedLessonIds,
    createdAt: iso(row.createdAt),
  };
}

export function toCurriculumListItem(row: CurriculumRow): Omit<Curriculum, "lessons" | "replanEvents"> {
  return {
    id: row.id,
    childId: row.childId,
    bookId: row.bookId,
    prompt: row.prompt,
    subject: row.subject,
    title: row.title,
    replanStatus: row.replanStatus,
  };
}

export function toCurriculum(
  row: CurriculumRow,
  lessons: LessonRow[],
  events: ReplanEventRow[],
  fullAccess: boolean,
): Curriculum {
  return {
    ...toCurriculumListItem(row),
    lessons: lessons.map((lesson) => toLessonSummary(lesson, fullAccess)),
    replanEvents: events.map(toReplanEvent),
  };
}
