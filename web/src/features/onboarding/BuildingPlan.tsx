'use client'

import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Mascot } from '@/components/Mascot'
import { SUBJECTS } from '@/lib/subjects'
import type { SubjectKey } from '@/lib/subjects'

const STAGES = ['Reading the goal', 'Matching the grade level', 'Ordering the lessons', 'Writing the first lesson']
const STAGE_MS = 900
const REVEAL_MS = 260
const HOLD_MS = 900

export function BuildingPlan({
  name,
  subject,
  gradeLevel,
  format,
  titles,
  onRevealed,
}: {
  name: string
  subject: SubjectKey
  gradeLevel: number | null
  format?: string
  titles: string[] | null
  onRevealed: () => void
}) {
  const [stage, setStage] = useState(0)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (titles) return
    const timer = setInterval(() => setStage((value) => Math.min(value + 1, STAGES.length - 1)), STAGE_MS)
    return () => clearInterval(timer)
  }, [titles])

  useEffect(() => {
    if (!titles) return
    if (shown < titles.length) {
      const timer = setTimeout(() => setShown(shown + 1), REVEAL_MS)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(onRevealed, HOLD_MS)
    return () => clearTimeout(timer)
  }, [titles, shown, onRevealed])

  const rows = titles
    ? titles.map((title, at) => ({ label: title, state: at < shown ? 'done' : at === shown ? 'active' : 'todo' }))
    : STAGES.map((label, at) => ({ label, state: at < stage ? 'done' : at === stage ? 'active' : 'todo' }))
  const details = [gradeLevel && `Grade ${gradeLevel}`, format].filter(Boolean).join(' · ')

  return (
    <div className={`${SUBJECTS[subject].className} a-fade mx-auto flex min-h-0 w-full max-w-[624px] flex-1 flex-col items-center gap-5 overflow-y-auto px-6 pt-[12dvh] md:px-8`}>
      <Mascot key={titles ? 'ready' : 'working'} pose={titles ? 'cheer' : 'laptop'} size={184} className={titles ? 'a-pop' : 'a-pulse'} />
      <div className="flex flex-col gap-2 text-center">
        <h1 className="q" aria-live="polite">
          {titles ? `${name}’s plan is ready` : `Building ${name}’s ${SUBJECTS[subject].short.toLowerCase()} plan…`}
        </h1>
        {details && <p className="sub">{details}</p>}
      </div>
      <ol key={titles ? 'titles' : 'stages'} className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.label} className="a-rise flex min-h-11 items-center gap-3">
            {row.state === 'done' ? (
              <span className="a-pop grid size-[30px] flex-none place-items-center rounded-full bg-s text-white">
                <Check size={16} strokeWidth={3.5} aria-hidden="true" />
              </span>
            ) : row.state === 'active' ? (
              <span className="spin text-s" style={{ width: 30, height: 30, borderWidth: 3 }} />
            ) : (
              <span className="size-[30px] flex-none rounded-full border-2 border-dashed border-[#C3C6D0]" />
            )}
            {row.state === 'todo' && titles ? (
              <span className="sk h-3 w-3/5" />
            ) : (
              <span className={`text-base font-bold ${row.state === 'todo' ? 'text-muted' : ''}`}>{row.label}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="sm mt-auto pb-7 text-center">About 10 seconds. Each lesson ends with a short quiz.</p>
    </div>
  )
}
