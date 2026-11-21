'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/Button'
import { Mascot } from '@/components/Mascot'
import type { Curriculum } from '@/contracts/domain'
import { loadPlans } from '@/features/product/data'
import { useSession } from '@/lib/session'
import { seenToday, streakOf } from '@/lib/streak'
import { useResource } from '@/lib/useResource'
import { StreakWeek } from './StreakWeek'

export function StreakMoment() {
  const { childId } = useSession()
  const load = useCallback(() => loadPlans(childId!), [childId])
  const { data } = useResource(childId ? load : null)

  return data ? <Moment plans={data} childId={childId} /> : null
}

function Moment({ plans, childId }: { plans: Curriculum[]; childId: string | null }) {
  const streak = streakOf(plans)
  const [open, setOpen] = useState(() => streak.doneToday && !seenToday('plus-one', childId))

  if (!open) return null

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Streak">
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-6 text-center">
          <Mascot pose={streak.perfectWeek ? 'graduate' : 'jump'} size={168} className="streak-bounce" />
          <p className="text-[84px] leading-[0.9] font-extrabold tracking-[-0.05em]" style={{ color: '#E8862B' }}>
            {streak.count}
          </p>
          <h2 className="q" style={{ fontSize: 26 }}>
            {streak.count === 1 ? 'day in a row!' : 'days in a row!'}
          </h2>
          <StreakWeek week={streak.week} framed />
          <p className="sub">
            {streak.perfectWeek ? 'A lesson every day this week.' : `Keep going tomorrow to make it ${streak.count + 1}.`}
          </p>
          <Button autoFocus block className="mt-2" onClick={() => setOpen(false)}>
            Continue
          </Button>
        </div>
      </div>
    </>
  )
}
