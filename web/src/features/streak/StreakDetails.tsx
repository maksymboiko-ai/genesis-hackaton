import { Mascot } from '@/components/Mascot'
import { daysLabel } from '@/lib/streak'
import type { StreakInfo } from '@/lib/streak'
import { StreakWeek } from './StreakWeek'

export function StreakDetails({ streak }: { streak: StreakInfo }) {
  return (
    <>
      <div className="flex items-center gap-3.5">
        <Mascot pose={streak.pose} size={76} />
        <div className="flex flex-col gap-0.5">
          <p className="text-[26px] leading-none font-extrabold tracking-tight">{daysLabel(streak.count)}</p>
          <p className="sm">Best so far: {daysLabel(streak.best)}</p>
        </div>
      </div>
      <StreakWeek week={streak.week} fill />
      <div className="flex items-center gap-3 rounded-[16px] bg-surface-2 p-3">
        <Mascot pose="sleep" size={44} />
        <p className="text-sm leading-snug">
          <b>{streak.freezeLeft ? '1 freeze left this week' : 'This week’s freeze is used'}</b>
          <span className="block text-muted">If a day gets missed, a freeze saves the streak automatically.</span>
        </p>
      </div>
      <p className="sm">
        <b className="text-text">How it works.</b> One finished lesson a day counts. Weekends count too, but you
        get one free freeze every week.
      </p>
    </>
  )
}
