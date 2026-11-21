'use client'

import { Check, ChevronLeft } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Button } from '@/components/Button'
import { Mascot } from '@/components/Mascot'
import type { MascotPose } from '@/components/Mascot'
import { SubjectTile } from '@/components/SubjectTile'
import { Wordmark } from '@/components/Wordmark'
import type { Child } from '@/contracts/domain'
import { api } from '@/lib/api'
import { gradeSubjects, subjectClass } from '@/lib/subjects'
import { BuildingPlan } from './BuildingPlan'
import { Explainer, StatAnxiety, StatSchool } from './InfoScreens'
import {
  EMPTY_ANSWERS,
  FORMAT,
  GOAL_MAX,
  GRADES,
  MAX_OBSTACLES,
  OBSTACLES,
  PACE,
  QUESTIONS,
  SCREENS,
  goalStarters,
  heading,
  isAnswered,
} from './questions'
import type { Answers, QuestionId } from './questions'

const SEGMENT_COLORS = ['m', 'r', 's']

const POSES: Partial<Record<QuestionId, MascotPose>> = {
  name: 'curious',
  grade: 'thumbs-up',
  subjects: 'reading',
  pace: 'curious',
  format: 'idea',
  goal: 'laptop',
}

function Mark() {
  return <Check size={14} strokeWidth={3.5} aria-hidden="true" />
}

function Meter({ level }: { level: number }) {
  return (
    <span aria-hidden="true" className="flex flex-none items-end gap-[3px]">
      {[8, 13, 18, 23].map((height, index) => (
        <i
          key={height}
          className="block w-1.5 rounded-sm"
          style={{ height, background: index < level ? 'var(--sci)' : 'var(--border)' }}
        />
      ))}
    </span>
  )
}

type Built = { child: Child; curriculumId: string; titles: string[] }

export function ChildQuiz({
  embedded = false,
  onDone,
  onCancel,
}: {
  embedded?: boolean
  onDone: (child: Child, curriculumId: string | null) => void
  onCancel?: () => void
}) {
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS)
  const [child, setChild] = useState<Child | null>(null)
  const [saving, setSaving] = useState<'plan' | 'skip' | null>(null)
  const [built, setBuilt] = useState<Built | null>(null)
  const [error, setError] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)

  const screen = SCREENS[index]
  const isLast = index === SCREENS.length - 1
  const name = answers.name.trim()
  const questionId = screen.kind === 'question' ? screen.id : screen.after
  const position = QUESTIONS.indexOf(questionId)
  const building = saving === 'plan' || built !== null
  const canContinue = screen.kind === 'info' || isAnswered(screen.id, answers)
  const busy = saving !== null
  const planSubject = answers.subjects[0] ?? answers.goal
  const subjectsOfGrade = gradeSubjects(answers.gradeLevel)

  useEffect(() => {
    if (index > 0) headingRef.current?.focus({ preventScroll: true })
  }, [index, building])

  const set = (patch: Partial<Answers>) => setAnswers((prev) => ({ ...prev, ...patch }))

  const go = (next: number) => {
    setDirection(next > index ? 'forward' : 'back')
    setIndex(next)
  }

  const toggleSubject = (value: string) =>
    set({
      subjects: answers.subjects.includes(value)
        ? answers.subjects.filter((item) => item !== value)
        : subjectsOfGrade
            .map((subject) => subject.name)
            .filter((name) => name === value || answers.subjects.includes(name)),
    })

  // A new grade has other subjects: keep only the picks it also has.
  const pickGrade = (gradeLevel: number) => {
    const names = new Set(gradeSubjects(gradeLevel).map((subject) => subject.name))
    set({ gradeLevel, subjects: answers.subjects.filter((name) => names.has(name)) })
  }

  const toggleObstacle = (value: string) => {
    if (answers.obstacles.includes(value)) {
      set({ obstacles: answers.obstacles.filter((item) => item !== value) })
    } else if (answers.obstacles.length < MAX_OBSTACLES) {
      set({ obstacles: [...answers.obstacles, value] })
    }
  }

  async function finish(withPlan: boolean) {
    setSaving(withPlan ? 'plan' : 'skip')
    setError('')

    let saved = child
    try {
      saved ??= await api.createChild({ name, gradeLevel: answers.gradeLevel! })
      setChild(saved)
    } catch {
      setError('Could not save the learner. Try again.')
      setSaving(null)
      return
    }

    if (!withPlan) return onDone(saved, null)

    try {
      // One picked subject is the plan's subject; with several, the goal decides.
      const subject = answers.subjects.length === 1 ? answers.subjects[0] : null
      const request = { childId: saved.id, prompt: answers.goal.trim(), bookId: null, subject }
      let result = await api.createCurriculum({ ...request, clarifications: [] })
      if (result.status === 'needs_clarification') {
        const known = [
          answers.subjects.length > 0 && `Subjects: ${answers.subjects.join(', ')}.`,
          `Grade ${saved.gradeLevel}.`,
          'Use your best judgement for anything else.',
        ]
          .filter(Boolean)
          .join(' ')
        result = await api.createCurriculum({
          ...request,
          clarifications: result.questions.map((question) => ({ question, answer: known })),
        })
      }
      if (result.status !== 'created') throw new Error('No plan')
      setBuilt({
        child: saved,
        curriculumId: result.curriculum.id,
        titles: result.curriculum.lessons.map((lesson) => lesson.title),
      })
      setSaving(null)
    } catch {
      setError(`${saved.name} is saved, but the plan could not be built. Try again, or skip and build it later.`)
      setSaving(null)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canContinue || busy) return
    if (isLast) finish(true)
    else go(index + 1)
  }

  const goBack = () => {
    if (index > 0) go(index - 1)
    else onCancel?.()
  }
  const canGoBack = !busy && ((index > 0 && !child) || (index === 0 && Boolean(onCancel)))

  const question = screen.kind === 'question' ? heading(screen.id, name) : null
  const wide = screen.kind === 'info'
  const starters = goalStarters(answers.gradeLevel, answers.subjects)
  const pose = screen.kind === 'question' ? POSES[screen.id] : undefined

  if (building) {
    return (
      <Shell embedded={embedded}>
        <BuildingPlan
          name={name}
          subject={planSubject}
          gradeLevel={answers.gradeLevel}
          format={FORMAT.find((option) => option.value === answers.format)?.short}
          titles={built?.titles ?? null}
          onRevealed={() => built && onDone(built.child, built.curriculumId)}
        />
      </Shell>
    )
  }

  let body: ReactNode = null
  if (screen.kind === 'info') {
    body =
      screen.id === 'stat-school' ? (
        <StatSchool headingRef={headingRef} name={name} pace={answers.pace} />
      ) : screen.id === 'stat-anxiety' ? (
        <StatAnxiety headingRef={headingRef} name={name} obstacles={answers.obstacles} />
      ) : (
        <Explainer headingRef={headingRef} name={name} />
      )
  } else if (question) {
    body = (
      <>
        <div className="flex flex-col gap-2">
          <h1 ref={headingRef} tabIndex={-1} className="q outline-none">
            {question.title}
          </h1>
          {question.hint && screen.id !== 'obstacles' && <p className="sub">{question.hint}</p>}
          {screen.id === 'obstacles' && (
            <div className="flex items-center justify-between">
              <p className="sub">{question.hint}</p>
              <span className="chip sm-chip bg-math-tint text-math-ink" aria-live="polite">
                {answers.obstacles.length} of {MAX_OBSTACLES}
              </span>
            </div>
          )}
        </div>

        {screen.id === 'name' && (
          <>
            <input
              aria-label="Child’s first name"
              className="in big"
              value={answers.name}
              onChange={(event) => set({ name: event.target.value })}
              placeholder="First name"
              autoComplete="off"
              autoFocus
            />
            <p className="sm">First name is enough. You can add more kids later.</p>
          </>
        )}

        {screen.id === 'grade' && (
          <div role="radiogroup" aria-label="Grade" className="stagger grid grid-cols-4 gap-2.5">
            {GRADES.map((grade) => (
              <button
                key={grade}
                type="button"
                role="radio"
                aria-checked={answers.gradeLevel === grade}
                onClick={() => pickGrade(grade)}
                className={`opt grade ${answers.gradeLevel === grade ? 'on' : ''}`}
              >
                {grade}
              </button>
            ))}
          </div>
        )}

        {screen.id === 'subjects' && (
          <>
            <div className="stagger flex flex-col gap-2.5">
              {subjectsOfGrade.map((subject) => {
                const on = answers.subjects.includes(subject.name)
                return (
                  <button
                    key={subject.name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSubject(subject.name)}
                    className={`opt ${on ? 'on' : ''}`}
                    style={{ minHeight: 76 }}
                  >
                    <SubjectTile subject={subject.family} size={48} />
                    <span className="flex flex-col gap-0.5">
                      <span>{subject.name}</span>
                      <span className="sm">{subject.blurb}</span>
                    </span>
                    <span className="cb">
                      <Mark />
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {screen.id === 'pace' && (
          <div role="radiogroup" aria-label={question.title} className="stagger flex flex-col gap-2.5">
            {PACE.map((option) => {
              const on = answers.pace === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ pace: option.value })}
                  className={`opt ${on ? 'on' : ''}`}
                >
                  <Meter level={option.level} />
                  <span>{option.label}</span>
                  <span className="rd">{on && <Mark />}</span>
                </button>
              )
            })}
          </div>
        )}

        {screen.id === 'format' && (
          <>
            <div role="radiogroup" aria-label={question.title} className="stagger flex flex-col gap-2.5">
              {FORMAT.map((option) => {
                const on = answers.format === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ format: option.value })}
                    className={`opt ${on ? 'on' : ''}`}
                  >
                    <span className="dot" style={{ background: option.color }} />
                    <span>{option.label}</span>
                    <span className="rd">{on && <Mark />}</span>
                  </button>
                )
              })}
            </div>
            <p className="sm">Best guess is fine. We learn the rest from the quizzes.</p>
          </>
        )}

        {screen.id === 'obstacles' && (
          <div className="stagger flex flex-col gap-2.5">
            {OBSTACLES.map((option) => {
              const on = answers.obstacles.includes(option.value)
              const full = !on && answers.obstacles.length >= MAX_OBSTACLES
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={on}
                  aria-disabled={full || undefined}
                  onClick={() => toggleObstacle(option.value)}
                  className={`opt ${on ? 'on' : ''} ${full ? 'dim' : ''}`}
                >
                  <span>{option.label}</span>
                  <span className="cb">
                    <Mark />
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {screen.id === 'goal' && (
          <>
            <textarea
              aria-label="Goal"
              className="in"
              value={answers.goal}
              onChange={(event) => set({ goal: event.target.value })}
              placeholder="Got a B in algebra, struggles with equations with negative numbers."
              maxLength={GOAL_MAX}
              autoFocus
            />
            <div className="stagger flex flex-wrap gap-2">
              {starters.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => set({ goal: starter.label })}
                  className={`chip ${subjectClass(starter.subject)} bg-s-tint text-s-ink`}
                >
                  {starter.label}
                </button>
              ))}
            </div>
          </>
        )}
      </>
    )
  }

  const primaryLabel =
    isLast ? 'Build the plan' : screen.kind === 'info' && screen.id === 'explainer' ? 'Got it' : 'Continue'
  const column = wide ? 'max-w-[960px]' : 'max-w-[624px]'

  return (
    <Shell
      embedded={embedded}
      top={
        <div className="flex min-h-11 w-full items-center gap-3">
          <button
            type="button"
            className="ib"
            aria-label={index === 0 ? 'Cancel' : 'Back'}
            onClick={goBack}
            disabled={!canGoBack}
            style={{ visibility: canGoBack ? 'visible' : 'hidden' }}
          >
            <ChevronLeft size={24} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <div
            className="pg"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={QUESTIONS.length}
            aria-valuenow={position + 1}
          >
            {QUESTIONS.map((id, at) => (
              <i
                key={id}
                className={`${SEGMENT_COLORS[at % 3]} ${
                  at < position || (at === position && screen.kind === 'info') ? 'done' : at === position ? 'cur' : ''
                }`}
              />
            ))}
          </div>
          <span className="stepn">{screen.kind === 'question' ? `${position + 1} of ${QUESTIONS.length}` : ''}</span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        {pose && (
          <Mascot key={pose} pose={pose} size={176} className="a-rise fixed right-12 bottom-10 hidden lg:block" />
        )}
        <div
          key={index}
          className={`mx-auto flex min-h-0 w-full flex-1 flex-col gap-6 overflow-x-hidden px-6 pt-7 pb-1 max-md:overflow-y-auto max-md:overscroll-contain md:flex-none md:overflow-visible md:gap-7 md:px-8 md:pt-16 max-md:[&>*:first-child]:mt-auto ${column} ${
            direction === 'forward' ? 'a-step' : 'a-step-back'
          }`}
        >
          {pose && (
            <div className="grid min-h-0 flex-1 place-items-center overflow-hidden md:hidden">
              <Mascot key={pose} pose={pose} size={140} className="a-pop h-auto max-h-full w-[156px] object-contain" />
            </div>
          )}
          {body}
          {error && (
            <p role="alert" className="a-fade rounded-[14px] bg-danger-soft px-4 py-3 text-sm font-bold text-danger">
              {error}
            </p>
          )}
        </div>

        <div
          className={`mx-auto flex w-full flex-none flex-col gap-2 px-6 pt-4 pb-6 md:mt-9 md:flex-row-reverse md:items-center md:justify-between md:px-8 md:pb-12 ${column}`}
        >
          <div className="flex flex-col gap-2 md:flex-row-reverse md:items-center md:gap-3">
            <Button type="submit" disabled={!canContinue || busy} className="w-full md:w-[200px]">
              {primaryLabel}
            </Button>
            {isLast && (
              <Button variant="ghost" onClick={() => finish(false)} busy={saving === 'skip'} disabled={busy}>
                Skip for now
              </Button>
            )}
          </div>
          {canGoBack && (
            <Button variant="ghost" onClick={goBack} className="hidden md:inline-flex">
              {index === 0 ? 'Cancel' : 'Back'}
            </Button>
          )}
        </div>
      </form>
    </Shell>
  )
}

function Shell({ embedded, top, children }: { embedded: boolean; top?: ReactNode; children: ReactNode }) {
  return (
    <div
      className={`flex flex-col overflow-x-clip ${
        embedded
          ? 'min-h-[calc(100svh-8rem)]'
          : 'h-svh overflow-y-hidden md:h-auto md:min-h-dvh md:overflow-y-visible'
      }`}
    >
      <header className="grid items-center px-2 pt-3 md:grid-cols-[200px_1fr_200px] md:px-8 md:pt-5">
        {embedded ? <span className="hidden md:block" /> : <Wordmark className="hidden md:inline-flex" />}
        <div className="w-full max-w-[520px] justify-self-center pr-2 md:pr-0">{top}</div>
        <span className="hidden md:block" />
      </header>
      {children}
    </div>
  )
}
