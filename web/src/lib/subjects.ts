import { popularSubjects, subjectFamily, subjectsForGrade } from '@/contracts/subjects'
import type { GradeSubject, SubjectFamily } from '@/contracts/subjects'

export type { GradeSubject }

// A subject family: decides the colour, the icon and how lessons render.
export type SubjectKey = SubjectFamily

export const SUBJECT_KEYS: SubjectKey[] = ['math', 'read', 'sci', 'social', 'lang', 'arts', 'move', 'tech']

export const SUBJECTS: Record<SubjectKey, { label: string; short: string; blurb: string; className: string }> = {
  math: { label: 'Math', short: 'Math', blurb: 'Numbers to algebra', className: 's-math' },
  read: { label: 'English', short: 'English', blurb: 'Stories, essays, grammar', className: 's-read' },
  sci: { label: 'Science', short: 'Science', blurb: 'Life, earth, physics', className: 's-sci' },
  social: { label: 'History & Society', short: 'History', blurb: 'People, places, government', className: 's-social' },
  lang: { label: 'World Language', short: 'Language', blurb: 'Words, phrases, conversation', className: 's-lang' },
  arts: { label: 'Arts', short: 'Arts', blurb: 'Drawing, music, writing', className: 's-arts' },
  move: { label: 'PE & Health', short: 'PE', blurb: 'Fitness, sport, wellbeing', className: 's-move' },
  tech: { label: 'Computer Science', short: 'Coding', blurb: 'Programs and problem solving', className: 's-tech' },
}

export function subjectKey(subject: string | null | undefined): SubjectKey {
  return subjectFamily(subject ?? '')
}

export function subjectClass(subject: string | null | undefined) {
  return SUBJECTS[subjectKey(subject)].className
}

export function subjectLabel(subject: string | null | undefined) {
  const text = (subject ?? '').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : SUBJECTS.math.label
}

/** Every subject of the grade, by its school name, core ones first. */
export function gradeSubjects(gradeLevel: number | null | undefined): GradeSubject[] {
  return subjectsForGrade(gradeLevel ?? 6)
}

/** The grade's three core subjects, for the first-plan screen. */
export function gradePopular(gradeLevel: number | null | undefined): GradeSubject[] {
  return popularSubjects(gradeLevel ?? 6)
}
