import { BookOpen, CodeXml, Dumbbell, FlaskConical, Globe, Languages, Palette } from 'lucide-react'
import { SUBJECTS } from '@/lib/subjects'
import type { SubjectKey } from '@/lib/subjects'

export function SubjectIcon({ subject, size = 24 }: { subject: SubjectKey; size?: number }) {
  if (subject === 'read') return <BookOpen size={size} strokeWidth={2.2} aria-hidden="true" />
  if (subject === 'sci') return <FlaskConical size={size} strokeWidth={2.2} aria-hidden="true" />
  if (subject === 'social') return <Globe size={size} strokeWidth={2.2} aria-hidden="true" />
  if (subject === 'arts') return <Palette size={size} strokeWidth={2.2} aria-hidden="true" />
  if (subject === 'move') return <Dumbbell size={size} strokeWidth={2.2} aria-hidden="true" />
  if (subject === 'lang') return <Languages size={size} strokeWidth={2.2} aria-hidden="true" />
  if (subject === 'tech') return <CodeXml size={size} strokeWidth={2.2} aria-hidden="true" />
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SubjectTile({
  subject,
  size = 48,
  className = '',
}: {
  subject: SubjectKey
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={`tile ${SUBJECTS[subject].className} ${className}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <SubjectIcon subject={subject} size={Math.round(size * 0.5)} />
    </span>
  )
}
