'use client'

import { Mascot } from '@/components/Mascot'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Check, ChevronLeft, ChevronRight, PencilLine } from 'lucide-react'
import { Button } from '@/components/Button'
import { KindIcon, KindTag } from '@/components/KindTag'
import { SubjectIcon } from '@/components/SubjectTile'
import { REPLAN_WINDOW } from '@/contracts/domain'
import type { Curriculum, LessonSummary, ReplanEvent } from '@/contracts/domain'
import { api } from '@/lib/api'
import { SUBJECTS, subjectKey } from '@/lib/subjects'
import { useResource } from '@/lib/useResource'
import { KeepGoing } from './KeepGoing'
import './plan.css'

const DROP_GAP_MS = 80
const STAGE_MS = 1100
const STAGES = ['Comparing the answers', 'Looking for a repeated pattern', 'Choosing what to add']

const isPreparing = (lesson: LessonSummary) =>
  lesson.contentStatus === 'pending' || lesson.contentStatus === 'generating'

const needsPolling = (curriculum: Curriculum) =>
  curriculum.replanStatus === 'running' || curriculum.lessons.some((lesson) => lesson.contentStatus === 'generating')

const skillLabel = (slug: string) => {
  const text = slug.replaceAll('-', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function dayLabel(iso: string) {
  const date = new Date(iso)
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'short' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? `a ${one}` : `${count} ${many}`
}

function changeLine(lessons: LessonSummary[]) {
  const reviews = lessons.filter((lesson) => lesson.kind === 'remedial').length
  const retries = lessons.filter((lesson) => lesson.kind === 'retry').length
  const challenges = lessons.filter((lesson) => lesson.kind === 'extension').length
  const parts = [
    reviews && plural(reviews, 'short review', 'short reviews'),
    retries && plural(retries, 'retry', 'retries'),
    challenges && plural(challenges, 'challenge', 'challenges'),
  ].filter(Boolean) as string[]
  if (parts.length === 0) return 'Plan updated'
  const last = parts.pop()
  return `Added ${parts.length ? `${parts.join(', ')} and ${last}` : last}`
}

// "6/7" once the quiz length is known, a percentage otherwise.
function scoreText(score: number | null, questions: number | null) {
  if (score === null) return null
  return questions ? `${Math.round(score * questions)}/${questions}` : `${Math.round(score * 100)}%`
}

type NodeState = 'done' | 'next' | 'prep' | 'up'

function PathNode({ lesson, state, number }: { lesson: LessonSummary; state: NodeState; number: number }) {
  if (state === 'done') {
    return (
      <span className="n-done">
        <Check size={17} strokeWidth={3.2} aria-hidden="true" />
      </span>
    )
  }
  if (state === 'prep') return <span className="n-prep" />
  const next = state === 'next'
  if (lesson.kind === 'remedial') {
    return (
      <span className={`n-review ${next ? 'halo-sun' : ''}`}>
        <KindIcon kind="remedial" size={15} />
      </span>
    )
  }
  if (lesson.kind === 'retry') {
    return (
      <span className={`n-retry ${next ? 'halo-ink' : ''}`}>
        <KindIcon kind="retry" size={14} />
      </span>
    )
  }
  if (lesson.kind === 'extension') {
    return (
      <span className={`n-chal ${next ? 'halo-chal' : ''}`}>
        <KindIcon kind="extension" size={15} />
      </span>
    )
  }
  return <span className={next ? 'n-next' : 'n-up'}>{number}</span>
}

function PlanRow({
  lesson,
  state,
  number,
  added,
  isNew,
  dropIndex,
}: {
  lesson: LessonSummary
  state: NodeState
  number: number
  added: boolean
  isNew: boolean
  dropIndex: number | null
}) {
  const score = scoreText(lesson.lastScore, lesson.questionCount)
  const showKind = lesson.kind !== 'core' && state !== 'done'
  const meta = (state === 'done' && score) || showKind || isNew || state === 'prep'
  const className = `row cp-row ${added ? 'added' : ''} ${dropIndex !== null ? 'a-drop' : ''}`
  const style = dropIndex !== null ? { animationDelay: `${300 + dropIndex * DROP_GAP_MS}ms` } : undefined

  const body = (
    <>
      <div className="nd">
        <PathNode lesson={lesson} state={state} number={number} />
      </div>
      <div className="flex items-center gap-3 py-3 pr-2">
        <div className="min-w-0 flex-1">
          <p className={`lt ${state === 'next' ? 'next' : ''} ${state === 'prep' ? 'text-muted' : ''}`}>
            <span className="sr-only">Lesson {number}: </span>
            {lesson.title}
          </p>
          {meta && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {state === 'done' && score && (
                <span className="sc">
                  <span className="sr-only">Score </span>
                  {score}
                </span>
              )}
              {showKind && <KindTag kind={lesson.kind} />}
              {isNew && <span className="k review">New</span>}
              {state === 'prep' && <span className="sm">Being prepared…</span>}
            </div>
          )}
        </div>
        {state !== 'prep' && <ChevronRight size={18} className="cp-go flex-none" aria-hidden="true" />}
      </div>
    </>
  )

  return (
    <li>
      {state === 'prep' ? (
        <div className={className} style={style}>
          {body}
        </div>
      ) : (
        <Link
          href={`/app/lessons/${lesson.id}`}
          className={className}
          style={style}
          aria-current={state === 'next' ? 'step' : undefined}
        >
          {body}
        </Link>
      )}
    </li>
  )
}

function AdjustNote({
  event,
  lessons,
  animate,
}: {
  event: ReplanEvent
  lessons: LessonSummary[]
  animate: boolean
}) {
  const [open, setOpen] = useState(false)
  const good = event.trigger === 'excelling'
  const { mistakes, missingSkills, summary } = event.diagnosis
  const detailsId = `why-${event.id}`

  return (
    <li className={`row ${animate ? 'a-step' : ''}`} style={{ alignItems: 'start' }}>
      <div className="nd pt-[22px]">
        <span className={good ? 'n-chal' : 'n-review'}>
          <PencilLine size={15} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </div>
      <div className={`cp-note ${good ? 'good' : ''}`}>
        <span className="cap" style={{ color: 'var(--note-ink)', letterSpacing: '0.06em' }}>
          Plan adjusted · {dayLabel(event.createdAt)}
        </span>
        <p className="m-0 text-[17px] leading-[1.35] font-bold">{changeLine(lessons)}</p>
        <p className="m-0 text-[15px] leading-[1.45] text-[#3f4452]">{summary}</p>
        <button
          type="button"
          className="cp-seewhy"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide details' : 'See why'}
          <ChevronRight size={15} strokeWidth={2.6} aria-hidden="true" />
        </button>
        <div id={detailsId} className={`cp-why ${open ? 'open' : ''}`} inert={!open}>
          <div>
            <div className="flex flex-col gap-3 pt-1 pb-1">
              {mistakes.length > 0 && (
                <div>
                  <p className="m-0 text-[14px] font-bold">What the quizzes showed</p>
                  <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[15px] leading-[1.45] text-[#3f4452]">
                    {mistakes.map((mistake) => (
                      <li key={mistake}>{mistake}</li>
                    ))}
                  </ul>
                </div>
              )}
              {missingSkills.length > 0 && (
                <div>
                  <p className="m-0 text-[14px] font-bold">Skills to rebuild</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {missingSkills.map((skill) => (
                      <span key={skill} className="skill">
                        {skillLabel(skill)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {lessons.length > 0 && (
                <div>
                  <p className="m-0 text-[14px] font-bold">What was added</p>
                  <ul className="mt-1.5 flex flex-col gap-1.5 text-[15px] leading-[1.4]">
                    {lessons.map((lesson) => (
                      <li key={lesson.id} className="flex flex-wrap items-center gap-2">
                        <KindTag kind={lesson.kind} />
                        <span>{lesson.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

function AdjustingCard() {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setStage((value) => Math.min(value + 1, STAGES.length - 1)), STAGE_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="a-rise flex flex-col gap-3.5 rounded-[22px] bg-sun-tint p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-2.5 text-sun-ink">
        <span className="spin" style={{ width: 22, height: 22, borderWidth: 3 }} aria-hidden="true" />
        <span className="cap">Adjusting the plan</span>
        <Mascot pose="keep-going" size={68} className="-my-4 ml-auto" />
      </div>
      <p className="m-0 text-[19px] leading-[1.35] font-bold">Looking at the last {REPLAN_WINDOW} quizzes…</p>
      <div className="flex flex-col gap-2">
        {STAGES.slice(0, stage + 1).map((label, index) => (
          <span
            key={label}
            className={`cp-tick flex items-center gap-2 text-[14px] leading-[1.45] ${index === stage ? 'font-bold' : ''}`}
          >
            {index < stage ? (
              <Check size={15} strokeWidth={3} className="text-sun-ink" aria-hidden="true" />
            ) : (
              <span
                className="spin text-sun-ink"
                style={{ width: 14, height: 14, borderWidth: 2 }}
                aria-hidden="true"
              />
            )}
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function GapRows() {
  return (
    <li className="cp-gap" aria-hidden="true">
      {[70, 55].map((width) => (
        <div key={width} className="row cp-row added">
          <div className="nd">
            <span className="sk" style={{ width: 28, height: 28, borderRadius: 8 }} />
          </div>
          <div className="py-3.5">
            <span className="sk" style={{ height: 14, width: `${width}%`, borderRadius: 7 }} />
          </div>
        </div>
      ))}
    </li>
  )
}

function UpNextCard({ lesson }: { lesson: LessonSummary }) {
  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-s-tint p-[18px]">
      <div className="flex items-center justify-between gap-3">
        <span className="cap text-s-ink">Up next · ~{lesson.estimatedMinutes} min</span>
        <KindTag kind={lesson.kind} />
      </div>
      <div>
        <h2 className="lt next" style={{ fontSize: 19 }}>
          {lesson.title}
        </h2>
        <p className="lo" style={{ color: '#3f4452' }}>
          {lesson.objective}
        </p>
      </div>
      <Link href={`/app/lessons/${lesson.id}`} className="btn md wide">
        Continue
        <ArrowRight size={19} strokeWidth={2.4} aria-hidden="true" />
      </Link>
    </div>
  )
}

function DoneCard({
  lessons,
  curriculumId,
  onExtended,
}: {
  lessons: LessonSummary[]
  curriculumId: string
  onExtended: () => void
}) {
  const scored = lessons.filter((lesson) => lesson.lastScore !== null)
  const average = scored.length
    ? Math.round((scored.reduce((sum, lesson) => sum + (lesson.lastScore ?? 0), 0) / scored.length) * 100)
    : null

  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-s-tint p-[18px]">
      <Mascot pose="graduate" size={108} className="a-pop" />
      <span className="cap text-s-ink">Plan complete</span>
      <div>
        <h2 className="lt next" style={{ fontSize: 19 }}>
          All {lessons.length} lessons done
        </h2>
        <p className="lo" style={{ color: '#3f4452' }}>
          {average === null
            ? 'Every lesson can be opened again from the list.'
            : `Average quiz score ${average}%. Every lesson can be opened again from the list.`}
        </p>
      </div>
      <KeepGoing curriculumId={curriculumId} onExtended={onExtended} />
      <Link href="/app" className="btn q wide" style={{ height: 44 }}>
        Back to plans
      </Link>
    </div>
  )
}

function PlanSkeleton() {
  return (
    <div className="cp-grid a-fade" aria-busy="true" aria-label="Loading the plan">
      <div className="cp-head flex flex-col gap-3">
        <span className="sk" style={{ height: 28, width: 110 }} />
        <span className="sk" style={{ height: 34, width: '70%' }} />
        <span className="sk" style={{ height: 8, width: '100%', borderRadius: 999 }} />
      </div>
      <div className="cp-next">
        <span className="sk" style={{ height: 176, width: '100%', borderRadius: 22 }} />
      </div>
      <div className="cp-path flex flex-col">
        {[62, 48, 70, 54, 60].map((width) => (
          <div key={width} className="row">
            <div className="nd">
              <span className="sk" style={{ width: 32, height: 32, borderRadius: '50%' }} />
            </div>
            <span className="sk" style={{ height: 14, width: `${width}%`, borderRadius: 7 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link href="/app" className="btn q sm-btn -ml-3 mb-2 gap-1 !px-2.5">
      <ChevronLeft size={19} strokeWidth={2.4} aria-hidden="true" />
      Plans
    </Link>
  )
}

export function CurriculumPage() {
  const { curriculumId } = useParams<{ curriculumId: string }>()
  const load = useCallback(() => api.getCurriculum(curriculumId), [curriculumId])
  const { data: curriculum, error, reload } = useResource(load, needsPolling)

  const [known, setKnown] = useState<string[] | null>(null)
  const [fresh, setFresh] = useState<string[]>([])
  const ids = curriculum?.lessons.map((lesson) => lesson.id) ?? null
  if (ids && (known === null || ids.length !== known.length || ids.some((id) => !known.includes(id)))) {
    if (known !== null) setFresh(ids.filter((id) => !known.includes(id)))
    setKnown(ids)
  }

  if (error) {
    return (
      <div className="a-fade mx-auto flex max-w-[620px] flex-col items-start gap-4">
        <BackLink />
        <h1 className="q">This plan could not be loaded</h1>
        <p className="sub" role="alert">
          {error}
        </p>
        <Button onClick={reload}>Try again</Button>
      </div>
    )
  }
  if (!curriculum) return <PlanSkeleton />

  const lessons = [...curriculum.lessons].sort((a, b) => a.position - b.position)
  const subject = subjectKey(curriculum.subject)
  const doneCount = lessons.filter((lesson) => lesson.completedAt).length
  const current = lessons.find((lesson) => !lesson.completedAt) ?? null
  const currentIndex = current ? lessons.indexOf(current) : lessons.length
  const adjusting = curriculum.replanStatus === 'running'

  const events = [...curriculum.replanEvents].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const latestEvent = events.at(-1) ?? null
  const eventOf = new Map<string, ReplanEvent>()
  events.forEach((event) => event.insertedLessonIds.forEach((id) => eventOf.set(id, event)))
  const addedCount = lessons.filter((lesson) => eventOf.has(lesson.id)).length

  const justBuilt = doneCount === 0 && events.length === 0
  const lastComplete = lessons.findLastIndex((lesson) => lesson.completedAt !== null)
  const gapAfter = adjusting ? Math.max(lastComplete, currentIndex - 1) : -2

  const stateOf = (lesson: LessonSummary, index: number): NodeState => {
    if (lesson.completedAt) return 'done'
    if (lesson === current) return 'next'
    if (lesson.contentStatus === 'generating') return 'prep'
    if (justBuilt && index > currentIndex + 1 && isPreparing(lesson)) return 'prep'
    return 'up'
  }
  const prepCount = lessons.filter((lesson, index) => stateOf(lesson, index) === 'prep').length

  const shownEvents = new Set<string>()
  const items: React.ReactNode[] = []
  if (gapAfter === -1) items.push(<GapRows key="gap" />)
  lessons.forEach((lesson, index) => {
    const event = eventOf.get(lesson.id)
    const freshIndex = fresh.indexOf(lesson.id)
    if (event && !shownEvents.has(event.id)) {
      shownEvents.add(event.id)
      items.push(
        <AdjustNote
          key={event.id}
          event={event}
          lessons={lessons.filter((candidate) => event.insertedLessonIds.includes(candidate.id))}
          animate={freshIndex !== -1}
        />,
      )
    }
    items.push(
      <PlanRow
        key={lesson.id}
        lesson={lesson}
        state={stateOf(lesson, index)}
        number={index + 1}
        added={event !== undefined}
        isNew={event !== undefined && event === latestEvent && !lesson.completedAt}
        dropIndex={freshIndex === -1 ? null : freshIndex}
      />,
    )
    if (index === gapAfter) items.push(<GapRows key="gap" />)
  })

  return (
    <div className={`${SUBJECTS[subject].className} a-rise`}>
      <div className="mx-auto max-w-[620px] lg:max-w-[1056px]">
        <BackLink />
      </div>
      <div className="cp-grid">
        <header className="cp-head flex flex-col gap-3">
          <span className="subj">
            <b className="grid size-7 place-items-center rounded-[9px] bg-s text-white">
              <SubjectIcon subject={subject} size={16} />
            </b>
            {SUBJECTS[subject].label}
          </span>
          <h1 className="q" style={{ fontSize: 30 }}>
            {curriculum.title}
          </h1>
          <div className="flex items-center gap-3">
            <div
              className="bar flex-1"
              role="progressbar"
              aria-label="Lessons done"
              aria-valuemin={0}
              aria-valuemax={lessons.length}
              aria-valuenow={doneCount}
            >
              <i style={{ width: `${lessons.length ? (doneCount / lessons.length) * 100 : 0}%` }} />
            </div>
            <span className="sm flex-none">
              <b className="text-text">
                {doneCount} of {lessons.length}
              </b>{' '}
              done
              {addedCount > 0 && latestEvent && ` · ${addedCount} added`}
            </span>
          </div>
        </header>

        <div className="cp-next">
          {adjusting ? (
            <AdjustingCard />
          ) : current ? (
            <UpNextCard lesson={current} />
          ) : (
            <DoneCard lessons={lessons} curriculumId={curriculum.id} onExtended={reload} />
          )}
        </div>

        <section className="cp-path flex flex-col gap-1" aria-labelledby="all-lessons">
          <h2 id="all-lessons" className="m-0 mb-1.5 text-[20px] font-extrabold">
            All lessons
          </h2>
          <ol className="path m-0 list-none p-0">
            <div className="spine" style={{ top: 30, bottom: 30 }} aria-hidden="true" />
            {items}
          </ol>
          {justBuilt && prepCount > 0 && (
            <p className="sm a-fade mt-3">
              {prepCount === 1 ? 'One lesson is' : `${prepCount} lessons are`} still being written. They build on how
              the first ones go.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
