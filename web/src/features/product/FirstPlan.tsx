import { Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/Button'
import { Mascot } from '@/components/Mascot'
import { SubjectIcon } from '@/components/SubjectTile'
import { SUBJECTS, gradePopular } from '@/lib/subjects'

const STEPS = [
  { title: 'You describe one goal', text: '“Got a B in algebra, struggles with negative numbers.”' },
  { title: 'A plan of short lessons appears', text: 'Each lesson takes about 10 minutes and ends with a quiz.' },
  { title: 'The plan fixes itself', text: 'After a few quizzes it adds review or a challenge, and tells you why.' },
]

export function FirstPlan({
  name,
  gradeLevel,
  onNewPlan,
  onPickSubject,
}: {
  name: string
  gradeLevel: number
  onNewPlan: () => void
  onPickSubject: (subject: string) => void
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch lg:gap-10 lg:pt-4">
      <div className="stagger flex flex-col gap-5 lg:justify-between">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
          <p className="cap text-math-ink">Start here</p>
          <h1 className="q" style={{ fontSize: 'clamp(26px, 3.4vw, 38px)' }}>
            Build {name}’s first plan
          </h1>
          <p className="sub">Pick a subject, say what’s hard, and the first plan is ready in about 10 seconds.</p>
          </div>
          <Mascot pose="idea" size={112} className="hidden sm:block" />
        </div>

        <div className="grid grid-cols-3 gap-2.5 md:gap-4">
          {gradePopular(gradeLevel).map((subject, at) => (
            <button
              key={subject.name}
              type="button"
              onClick={() => onPickSubject(subject.name)}
              className={`first-tile ${SUBJECTS[subject.family].className}`}
              style={{ animationDelay: `${120 + at * 70}ms` }}
              title={subject.blurb}
            >
              <SubjectIcon subject={subject.family} size={30} />
              <span className="leading-tight">{subject.name}</span>
            </button>
          ))}
        </div>

        <Button block onClick={onNewPlan}>
          <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
          Describe a goal
        </Button>
      </div>

      <section aria-labelledby="how-title" className="a-rise flex flex-col rounded-[22px] bg-surface-2 p-5 md:p-7" style={{ animationDelay: '200ms' }}>
        <h2 id="how-title" className="cap mb-4 text-muted">
          How it works
        </h2>
        <ol className="relative flex flex-1 flex-col justify-between gap-5">
          <i aria-hidden="true" className="a-grow absolute top-4 bottom-12 left-[15px] block w-[3px] origin-top rounded bg-[#D5D8E0]" />
          {STEPS.map((step, at) => (
            <li
              key={step.title}
              className="a-drop relative z-[1] grid grid-cols-[32px_minmax(0,1fr)] items-start gap-3.5"
              style={{ animationDelay: `${350 + at * 260}ms` }}
            >
              {at === 2 ? (
                <span className="grid size-8 place-items-center rounded-full bg-sun text-sun-ink">
                  <RotateCcw size={16} strokeWidth={2.6} aria-hidden="true" />
                </span>
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-math text-[13px] font-extrabold text-white">
                  {at + 1}
                </span>
              )}
              <span className="flex flex-col gap-1 pt-1">
                <span className="text-[16px] leading-snug font-bold">{step.title}</span>
                <span className="sm">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
