import { Mascot } from '@/components/Mascot'
import { daysLabel, streakOf } from '@/lib/streak'
import { StreakWeek } from './StreakWeek'

export function StreakCard({ days }: { days: string[] }) {
  const streak = streakOf(days)

  const title =
    streak.state === 'none'
      ? 'Start a streak today'
      : streak.state === 'frozen'
        ? 'The streak is safe'
        : `${daysLabel(streak.count)} in a row`
  const text =
    streak.state === 'done'
      ? 'Done for today. Come back tomorrow to keep it going.'
      : streak.state === 'frozen'
        ? `A freeze covered ${streak.frozenDay}. Still ${daysLabel(streak.count)} in a row.`
        : streak.state === 'none'
          ? 'One lesson today starts it.'
          : 'One lesson today keeps it going.'

  return (
    <section className="streak a-rise" aria-label="Streak">
      <Mascot pose={streak.pose} size={112} className="streak-mascot" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h2 className="text-[22px] leading-tight font-extrabold tracking-tight md:text-[24px]">{title}</h2>
        <p className="text-[15px] leading-snug text-muted md:text-base">{text}</p>
        <div className="max-w-[310px]">
          <StreakWeek week={streak.week} fill />
        </div>
      </div>
    </section>
  )
}
