import { Repeat, RotateCcw, TrendingUp } from 'lucide-react'
import type { LessonKind } from '@/contracts/domain'

const LABELS: Record<LessonKind, string> = {
  core: 'Core',
  remedial: 'Review',
  retry: 'Retry',
  extension: 'Challenge',
}

const CLASSES: Record<LessonKind, string> = {
  core: 'core',
  remedial: 'review',
  retry: 'retry',
  extension: 'challenge',
}

export function KindIcon({ kind, size = 13 }: { kind: LessonKind; size?: number }) {
  const props = { size, strokeWidth: 2.6, 'aria-hidden': true } as const
  if (kind === 'remedial') return <RotateCcw {...props} />
  if (kind === 'retry') return <Repeat {...props} />
  if (kind === 'extension') return <TrendingUp {...props} />
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'block' }} />
}

export function KindTag({ kind }: { kind: LessonKind }) {
  return (
    <span className={`k ${CLASSES[kind]}`}>
      <KindIcon kind={kind} />
      {LABELS[kind]}
    </span>
  )
}

export const kindLabel = (kind: LessonKind) => LABELS[kind]
