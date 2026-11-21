'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/Button'
import { Mascot } from '@/components/Mascot'
import type { Curriculum } from '@/contracts/domain'
import { nextLesson, pickUpNext } from '@/features/product/data'
import { daysLabel, seenToday, streakOf } from '@/lib/streak'
import { StreakWeek } from './StreakWeek'

export function StreakNotice({ plans, days, childId }: { plans: Curriculum[]; days: string[]; childId: string }) {
  const streak = streakOf(days)
  const kind = streak.state === 'frozen' ? 'freeze' : streak.state === 'none' && streak.last > 0 ? 'restart' : null
  const [open, setOpen] = useState(() => kind !== null && !seenToday(kind, childId))

  if (!open || !kind) return null

  const upNext = pickUpNext(plans)
  const lesson = upNext && nextLesson(upNext)
  const href = lesson ? `/app/lessons/${lesson.id}` : '/app'

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Streak">
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-6 text-center">
          <Mascot pose={kind === 'freeze' ? 'sleep' : 'peek'} size={150} className="a-pop" />
          <h2 className="q" style={{ fontSize: 26 }}>
            {kind === 'freeze' ? 'The streak is safe' : 'Fresh start today'}
          </h2>
          <p className="sub max-w-[22em]">
            {kind === 'freeze'
              ? `A freeze covered ${streak.frozenDay}. Still ${daysLabel(streak.count)} in a row.`
              : `The last streak was ${daysLabel(streak.last)}. Best ever: ${streak.best}. One lesson starts a new one.`}
          </p>
          {kind === 'freeze' && <StreakWeek week={streak.week} framed />}
          <Link href={href} className="btn wide mt-3" onClick={() => setOpen(false)}>
            {kind === 'freeze' ? 'Do today’s lesson' : 'Start a new streak'}
          </Link>
          <Button variant="ghost" block onClick={() => setOpen(false)}>
            Not now
          </Button>
        </div>
      </div>
    </>
  )
}
