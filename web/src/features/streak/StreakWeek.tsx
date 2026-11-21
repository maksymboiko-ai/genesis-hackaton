import { Check, Snowflake } from 'lucide-react'
import type { StreakInfo } from '@/lib/streak'
import './streak.css'

const LABELS = { done: 'lesson done', frozen: 'covered by a freeze', today: 'today, not yet', missed: 'no lesson', ahead: 'coming up' }

export function StreakWeek({
  week,
  framed = false,
  fill = false,
}: {
  week: StreakInfo['week']
  framed?: boolean
  fill?: boolean
}) {
  return (
    <ol className={`streak-week ${framed ? 'framed' : ''} ${fill || framed ? 'fill' : ''}`}>
      {week.map((day, at) => (
        <li key={at}>
          <span className={`streak-day ${day.state}`}>
            {day.state === 'done' && <Check size={16} strokeWidth={3.5} aria-hidden="true" />}
            {day.state === 'frozen' && <Snowflake size={16} strokeWidth={2.4} aria-hidden="true" />}
          </span>
          <span className="text-[12px] font-bold text-muted" aria-hidden="true">
            {day.letter}
          </span>
          <span className="sr-only">
            {day.name}: {LABELS[day.state]}
          </span>
        </li>
      ))}
    </ol>
  )
}
