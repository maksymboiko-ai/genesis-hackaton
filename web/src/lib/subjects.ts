export type SubjectKey = 'math' | 'read' | 'sci'

export const SUBJECT_KEYS: SubjectKey[] = ['math', 'read', 'sci']

export const SUBJECTS: Record<SubjectKey, { label: string; short: string; blurb: string; className: string }> = {
  math: { label: 'Math', short: 'Math', blurb: 'Numbers to algebra', className: 's-math' },
  read: { label: 'Reading & Writing', short: 'Reading', blurb: 'Stories, essays, grammar', className: 's-read' },
  sci: { label: 'Science', short: 'Science', blurb: 'Life, earth, physics', className: 's-sci' },
}

const READ = /read|writ|english|literat|gramm|essay|language|spell|vocab|poe|story|phonics/i
const SCI = /scien|biolog|chemi|physic|earth|astronom|ecolog|geolog|cell|genetic|energy|climate|anatomy/i

export function subjectKey(subject: string | null | undefined): SubjectKey {
  const value = subject ?? ''
  if (READ.test(value)) return 'read'
  if (SCI.test(value)) return 'sci'
  return 'math'
}

export function subjectClass(subject: string | null | undefined) {
  return SUBJECTS[subjectKey(subject)].className
}

export function subjectLabel(subject: string) {
  const text = subject.trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : SUBJECTS.math.label
}
