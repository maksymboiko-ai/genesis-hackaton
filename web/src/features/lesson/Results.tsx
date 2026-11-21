'use client'

import { Check, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { KindTag } from '@/components/KindTag'
import type { PublicQuestion, SubmitAttemptResponse } from '@/contracts/api'
import type { Curriculum, QuestionResult } from '@/contracts/domain'
import { isMathy, shortPrompt } from './text'

type Props = {
  result: SubmitAttemptResponse
  questions: PublicQuestion[]
  curriculum: Curriculum | null
  curriculumId: string
  lessonNumber: number | null
  onRetake: () => void
}

function headline(right: number, total: number) {
  const missed = total - right
  if (missed === 0) return 'Every one right. This is solid.'
  if (right / total >= 0.8) return `Strong work. ${missed === 1 ? 'One' : missed} to look at again.`
  if (right / total >= 0.5) return 'Good effort. A few to look at again.'
  return 'That one was tricky. That’s useful to know.'
}

function Answer({ text }: { text: string }) {
  return <b className={isMathy(text) ? 'mono' : ''}>{text}</b>
}

function ResultItem({ result, question, number }: { result: QuestionResult; question: PublicQuestion | undefined; number: number }) {
  const prompt = question ? shortPrompt(question.prompt) : ''
  const chosen = question?.choices[result.chosenIndex] ?? ''
  const correct = question?.choices[result.correctIndex] ?? ''

  return (
    <li className={`res ${result.correct ? '' : 'miss'}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="sm min-w-0">
          Question {number}
          {prompt && (
            <>
              {' · '}
              <span className={`text-text ${isMathy(prompt) ? 'mono' : ''}`}>{prompt}</span>
            </>
          )}
        </span>
        {result.correct ? (
          <span className="k flex-none bg-sci-tint! text-sci-ink!">
            <Check size={13} strokeWidth={3.2} aria-hidden="true" />
            Got it
          </span>
        ) : (
          <span className="k review flex-none pl-2.5!">Worth another look</span>
        )}
      </div>
      {result.correct ? (
        <div className="ans bg-sci-tint">
          <span className="sm w-[84px] flex-none font-bold text-sci-ink!">Your answer</span>
          <Answer text={chosen} />
        </div>
      ) : (
        <>
          <div className="ans bg-surface-2">
            <span className="sm w-[84px] flex-none">You chose</span>
            <Answer text={chosen} />
          </div>
          <div className="ans bg-sci-tint">
            <span className="sm w-[84px] flex-none font-bold text-sci-ink!">Answer</span>
            <Answer text={correct} />
          </div>
        </>
      )}
      <p className={result.correct ? 'sm' : 'm-0 text-[15px] leading-normal'}>{result.explanation}</p>
    </li>
  )
}

export function Results({ result, questions, curriculum, curriculumId, lessonNumber, onRetake }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0 })
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  const total = result.results.length
  const right = result.results.filter((item) => item.correct).length
  const numbered = result.results.map((item, index) => ({ item, number: index + 1 }))
  const ordered = [...numbered.filter((entry) => !entry.item.correct), ...numbered.filter((entry) => entry.item.correct)]
  const misses = total - right
  const visibleCount = Math.max(misses + 2, 3)
  const visible = showAll ? ordered : ordered.slice(0, visibleCount)
  const hidden = ordered.length - visible.length

  const adjusting = result.replanTriggered !== null && (!curriculum || curriculum.replanStatus === 'running')
  const adjusted = result.replanTriggered !== null && !adjusting
  const next =
    curriculum?.lessons.find((lesson) => !lesson.completedAt) ??
    (result.nextLessonId ? { id: result.nextLessonId, title: '', kind: 'core' as const, position: -1 } : null)
  const nextNumber = curriculum && next ? curriculum.lessons.findIndex((lesson) => lesson.id === next.id) + 1 : 0
  const planHref = `/app/curricula/${curriculumId}`
  const good = result.replanTriggered === 'excelling'

  return (
    <div className="mx-auto w-full max-w-[1044px]">
      <Link href={planHref} className="barbtn -ml-2">
        <ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" />
        Plan
      </Link>

      <div className="mt-3 grid gap-6 pb-10 lg:mt-8 lg:grid-cols-[340px_minmax(0,640px)] lg:justify-center lg:gap-16">
        <aside className="a-rise flex flex-col gap-[18px] lg:sticky lg:top-24 lg:self-start">
          <h1 ref={headingRef} tabIndex={-1} className="flex items-baseline gap-2.5 outline-none">
            <span className="text-[80px] leading-none font-extrabold tracking-[-0.05em] lg:text-[96px]">{right}</span>
            <span className="text-[26px] font-extrabold text-muted lg:text-[28px]">of {total}</span>
            {lessonNumber && <span className="sr-only">, lesson {lessonNumber} done</span>}
          </h1>
          <div className="scorebar flex gap-1.5" aria-hidden="true">
            {result.results.map((item, index) => (
              <i
                key={item.questionId}
                className={item.correct ? 'bg-s' : 'bg-sun'}
                style={{ animationDelay: `${index * 80}ms` }}
              />
            ))}
          </div>
          <p className="sub text-[18px]! text-text!">{result.feedback.headline || headline(right, total)}</p>
          {result.feedback.summary && <p className="sm">{result.feedback.summary}</p>}

          {result.replanTriggered && (
            <div
              className={`a-drop flex flex-col gap-2.5 rounded-[22px] p-[18px] ${good ? 'bg-challenge-tint' : 'bg-sun-tint'}`}
              aria-live="polite"
            >
              <div className={`flex items-center gap-2.5 ${good ? 'text-challenge-ink' : 'text-sun-ink'}`}>
                {adjusting ? (
                  <span className="spin" aria-hidden="true" />
                ) : (
                  <Check size={18} strokeWidth={3} aria-hidden="true" />
                )}
                <span className="cap">{adjusting ? 'Updating your plan' : 'Plan updated'}</span>
              </div>
              <p className="m-0 text-base leading-normal font-medium">
                {good
                  ? adjusting
                    ? 'These went really well, so a harder lesson is being added at the end.'
                    : 'These went really well, so a harder lesson was added at the end.'
                  : adjusting
                    ? 'A couple of short lessons are being added to make the next part easier. This one comes back after them.'
                    : 'A couple of short lessons were added to make the next part easier. This one comes back after them.'}
              </p>
              {adjusted && (
                <Link href={planHref} className="text-[15px] font-bold text-text underline underline-offset-4">
                  See what changed
                </Link>
              )}
            </div>
          )}

          <div className="hidden flex-col gap-2.5 lg:flex">
            <NextCard
              next={next}
              nextNumber={nextNumber}
              adjusting={adjusting}
              planHref={planHref}
            />
            <button type="button" className="btn q wide" style={{ height: 44 }} onClick={onRetake}>
              Try these questions again
            </button>
          </div>
        </aside>

        <section aria-label="Your answers" className="flex flex-col gap-3.5">
          <ul className="stagger m-0 flex list-none flex-col gap-3.5 p-0">
            {visible.map(({ item, number }) => (
              <ResultItem
                key={item.questionId}
                result={item}
                number={number}
                question={questions.find((question) => question.id === item.questionId)}
              />
            ))}
          </ul>
          {hidden > 0 && (
            <button type="button" className="btn q wide" style={{ height: 44 }} onClick={() => setShowAll(true)}>
              Show {hidden} more
            </button>
          )}
          <div className="flex flex-col gap-2.5 lg:hidden">
            <button type="button" className="btn q wide" style={{ height: 44 }} onClick={onRetake}>
              Try these questions again
            </button>
          </div>
        </section>
      </div>

      <div className="lesson-foot lg:hidden!">
        <NextCard next={next} nextNumber={nextNumber} adjusting={adjusting} planHref={planHref} compact />
      </div>
      <div className="h-36 lg:hidden" aria-hidden="true" />
    </div>
  )
}

function NextCard({
  next,
  nextNumber,
  adjusting,
  planHref,
  compact,
}: {
  next: { id: string; title: string; kind: 'core' | 'remedial' | 'retry' | 'extension' } | null
  nextNumber: number
  adjusting: boolean
  planHref: string
  compact?: boolean
}) {
  if (adjusting) {
    return (
      <button type="button" className="btn wide" disabled>
        Updating…
      </button>
    )
  }

  if (!next) {
    return (
      <Link href={planHref} className="btn wide">
        Back to the plan
      </Link>
    )
  }

  const label = nextNumber > 0 ? `Start lesson ${nextNumber}` : 'Next lesson'

  if (compact) {
    return (
      <>
        <Link href={`/app/lessons/${next.id}`} className="btn wide">
          {label}
        </Link>
        <Link href={planHref} className="btn q wide" style={{ height: 44 }}>
          Done for today
        </Link>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[22px] bg-s-tint p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <span className="cap text-s-ink">Up next</span>
        {next.kind !== 'core' && <KindTag kind={next.kind} />}
      </div>
      {next.title && (
        <p className="lt next text-[19px]!">
          {nextNumber > 0 ? `${nextNumber} · ` : ''}
          {next.title}
        </p>
      )}
      <Link href={`/app/lessons/${next.id}`} className="btn md wide">
        {label}
      </Link>
      <Link href={planHref} className="btn q wide" style={{ height: 44 }}>
        Done for today
      </Link>
    </div>
  )
}
