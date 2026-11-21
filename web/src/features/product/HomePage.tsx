'use client'

import { ArrowRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button } from '@/components/Button'
import { kindLabel } from '@/components/KindTag'
import { StatusNote } from '@/components/StatusNote'
import { SubjectIcon, SubjectTile } from '@/components/SubjectTile'
import type { Child, Curriculum } from '@/contracts/domain'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { SUBJECTS, SUBJECT_KEYS, subjectClass, subjectKey, subjectLabel } from '@/lib/subjects'
import type { SubjectKey } from '@/lib/subjects'
import { useResource } from '@/lib/useResource'
import {
  averageScore,
  dayLabel,
  doneLessons,
  isAdjusting,
  lessonNumber,
  lessonsThisWeek,
  loadPlans,
  nextLesson,
  pickUpNext,
  planChanges,
} from './data'
import type { PlanChange } from './data'
import { FirstPlan } from './FirstPlan'
import { EMPTY_DRAFT, NewPlanDialog } from './NewPlanDialog'
import type { PlanDraft } from './NewPlanDialog'
import './product.css'

type Tab = 'lessons' | 'parents'
const TAB_KEY = 'home-tab'

function readTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === 'parents' ? 'parents' : 'lessons'
  } catch {
    return 'lessons'
  }
}

function Tabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next = tab === 'lessons' ? 'parents' : 'lessons'
    onChange(next)
    event.currentTarget.querySelector<HTMLElement>(`#tab-${next}`)?.focus()
  }

  return (
    <div role="tablist" aria-label="Home view" className="tabs w-full md:w-[420px]" data-tab={tab} onKeyDown={onKeyDown}>
      {(['lessons', 'parents'] as const).map((value) => (
        <button
          key={value}
          id={`tab-${value}`}
          type="button"
          role="tab"
          aria-selected={tab === value}
          aria-controls="home-panel"
          tabIndex={tab === value ? 0 : -1}
          onClick={() => onChange(value)}
        >
          {value === 'lessons' ? 'Lessons' : 'For parents'}
        </button>
      ))}
    </div>
  )
}

function Skeleton({ tab }: { tab: Tab }) {
  return (
    <div className="a-fade flex flex-col gap-[18px]" aria-busy="true" aria-label="Loading">
      {tab === 'lessons' ? (
        <>
          <span className="sk" style={{ width: '60%', maxWidth: 320, height: 26, borderRadius: 10 }} />
          <span className="sk h-[210px] md:h-[116px]" style={{ borderRadius: 26 }} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
            <span className="sk" style={{ height: 150, borderRadius: 22 }} />
            <span className="sk" style={{ height: 150, borderRadius: 22 }} />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            {[0, 1, 2].map((item) => (
              <span key={item} className="sk" style={{ height: 82, borderRadius: 20 }} />
            ))}
          </div>
          <span className="sk" style={{ height: 180, borderRadius: 20 }} />
          <span className="sk" style={{ height: 84, borderRadius: 18 }} />
          <span className="sk" style={{ height: 84, borderRadius: 18 }} />
        </>
      )}
    </div>
  )
}

function Building({ subject }: { subject: SubjectKey }) {
  return (
    <div
      className={`a-drop flex items-center gap-3.5 rounded-[22px] bg-s-tint p-[18px] ${SUBJECTS[subject].className}`}
      role="status"
      aria-live="polite"
    >
      <SubjectTile subject={subject} size={48} className="a-pulse" />
      <div className="flex flex-1 flex-col gap-1.5">
        <p className="text-base leading-snug font-bold">Building a {SUBJECTS[subject].label} plan…</p>
        <div className="bar build-bar" style={{ height: 6, background: '#fff' }}>
          <i />
        </div>
        <span className="sm">About 10 seconds</span>
      </div>
    </div>
  )
}

function UpNext({ plan }: { plan: Curriculum }) {
  const lesson = nextLesson(plan)!
  const subject = subjectKey(plan.subject)
  const meta = [
    subjectLabel(plan.subject),
    `Lesson ${lessonNumber(plan, lesson)}`,
    lesson.kind !== 'core' && kindLabel(lesson.kind),
  ].filter(Boolean)

  return (
    <div className={`upnext ${SUBJECTS[subject].className}`}>
      <span className="hidden md:block">
        <span className="glass size-16 rounded-[20px]">
          <SubjectIcon subject={subject} size={30} />
        </span>
      </span>
      <div className="flex flex-1 flex-col gap-4 md:gap-1.5">
        <span className="inline-flex items-center gap-2 text-sm font-bold md:text-[15px]">
          <span className="md:hidden">
            <span className="glass size-[30px] rounded-[10px]">
              <SubjectIcon subject={subject} size={16} />
            </span>
          </span>
          {meta.join(' · ')}
        </span>
        <p className="text-[26px] leading-[1.15] font-extrabold tracking-tight text-balance md:text-[30px]">
          {lesson.title}
        </p>
      </div>
      <Link href={`/app/lessons/${lesson.id}`} className="upnext-go">
        {doneLessons(plan).length === 0 ? 'Start' : 'Continue'}
        <ArrowRight size={20} strokeWidth={2.4} aria-hidden="true" />
      </Link>
    </div>
  )
}

function PlanTile({ plan, fresh }: { plan: Curriculum; fresh: boolean }) {
  const subject = subjectKey(plan.subject)
  const lesson = nextLesson(plan)
  const total = plan.lessons.length

  return (
    <Link
      href={`/app/curricula/${plan.id}`}
      className={`plan-tile ${SUBJECTS[subject].className} ${fresh ? 'a-pop' : ''}`}
    >
      <span className="glass size-9 rounded-[11px]">
        <SubjectIcon subject={subject} size={18} />
      </span>
      <span className="mt-auto text-[17px] leading-tight font-extrabold text-balance">{plan.title}</span>
      <span className="text-[13px] font-semibold opacity-90">
        {lesson ? `Lesson ${lessonNumber(plan, lesson)} of ${total}` : `All ${total} lessons done`}
      </span>
    </Link>
  )
}

function LessonsTab({
  child,
  plans,
  building,
  freshId,
  onNewPlan,
}: {
  child: Child
  plans: Curriculum[]
  building: SubjectKey | null
  freshId: string | null
  onNewPlan: () => void
}) {
  const upNext = pickUpNext(plans)
  const others = plans.filter((plan) => plan !== upNext)

  if (plans.length === 0 && !building) {
    return (
      <div className="grid gap-[22px] lg:grid-cols-2 lg:items-center lg:gap-10 lg:pt-4">
        <div className="stagger grid grid-cols-3 gap-2.5 md:gap-4 lg:order-2" aria-hidden="true">
          {SUBJECT_KEYS.map((key) => (
            <span key={key} className={`tile aspect-square w-full ${SUBJECTS[key].className}`} style={{ borderRadius: 26 }}>
              <SubjectIcon subject={key} size={40} />
            </span>
          ))}
        </div>
        <div className="stagger flex flex-col gap-[22px] lg:order-1">
          <div className="flex flex-col gap-2">
            <h1 className="q" style={{ fontSize: 'clamp(26px, 3.4vw, 38px)' }}>
              No lessons yet
            </h1>
            <p className="sub">A grown-up can make the first plan in about a minute.</p>
          </div>
          <Button onClick={onNewPlan} className="w-full lg:w-auto lg:self-start">
            <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
            Make {child.name}’s first plan
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[18px] md:gap-[26px]">
      <h1 className="q a-rise" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)' }}>
        {upNext ? 'Ready for 10 minutes?' : building ? 'A new plan is on its way' : 'All caught up'}
      </h1>
      {building && <Building subject={building} />}
      <div className="stagger flex flex-col gap-[18px] md:gap-[26px]">
        {upNext ? (
          <UpNext plan={upNext} />
        ) : (
          !building && (
            <div className="flex flex-col gap-2 rounded-[22px] bg-surface-2 p-[22px]">
              <p className="text-lg leading-snug font-bold">Every lesson is done.</p>
              <p className="sub" style={{ fontSize: 16 }}>
                A grown-up can start a new plan from the For parents tab.
              </p>
            </div>
          )
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
          {others.map((plan) => (
            <PlanTile key={plan.id} plan={plan} fresh={plan.id === freshId} />
          ))}
          <div className="hidden md:block">
            <button type="button" className="new-tile flex w-full" onClick={onNewPlan}>
              <Plus size={24} strokeWidth={2.4} aria-hidden="true" />
              New plan
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="cardx p-3.5 md:p-[18px]">
      <p className="stat-n">{value}</p>
      <p className="sm" style={{ marginTop: 6 }}>
        {label}
      </p>
    </div>
  )
}

function ChangeRow({ change }: { change: PlanChange }) {
  const subject = subjectKey(change.plan.subject)
  return (
    <Link
      href={`/app/curricula/${change.plan.id}`}
      className="flex items-start gap-3 border-t border-border py-3 transition-opacity hover:opacity-75"
    >
      <SubjectTile subject={subject} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug font-bold">{change.title}</p>
        <p className="sm">
          {dayLabel(change.event.createdAt)} · {change.detail}
        </p>
      </div>
    </Link>
  )
}

function planStatus(plan: Curriculum): { dot: string; text: string } {
  if (plan.replanStatus === 'running') return { dot: 'var(--sun)', text: 'Adjusting the plan now…' }
  const latest = [...plan.replanEvents].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
  if (latest) {
    const day = dayLabel(latest.createdAt).toLowerCase()
    const when = day === 'today' || day === 'yesterday' ? day : `on ${dayLabel(latest.createdAt)}`
    return latest.trigger === 'excelling'
      ? { dot: 'var(--challenge)', text: `Challenge added ${when}` }
      : { dot: '#e0a800', text: `Plan updated ${when}` }
  }
  if (doneLessons(plan).length === 0) return { dot: 'var(--s)', text: 'New plan' }
  if (!nextLesson(plan)) return { dot: 'var(--success)', text: 'Finished' }
  return { dot: 'var(--s)', text: 'On track' }
}

function PlanRow({ plan, fresh }: { plan: Curriculum; fresh: boolean }) {
  const subject = subjectKey(plan.subject)
  const done = doneLessons(plan).length
  const total = plan.lessons.length
  const status = planStatus(plan)

  return (
    <Link href={`/app/curricula/${plan.id}`} className={`plan-row ${subjectClass(plan.subject)} ${fresh ? 'a-pop' : ''}`}>
      <SubjectTile subject={subject} size={44} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-base leading-snug font-bold">{plan.title}</span>
        <div className="flex items-center gap-2.5">
          <div
            className="bar flex-1"
            style={{ height: 6 }}
            role="progressbar"
            aria-label="Lessons done"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
          >
            <i className="a-grow" style={{ width: `${Math.max(2, (done / Math.max(1, total)) * 100)}%` }} />
          </div>
          <span className="sm flex-none" style={{ fontFamily: 'var(--mono)' }}>
            {done}/{total}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[13px] leading-tight font-semibold text-[#4a4f5c]">
          <i className="block size-2 rounded-full" style={{ background: status.dot }} />
          {status.text}
        </span>
      </div>
    </Link>
  )
}

function ParentsTab({
  child,
  plans,
  building,
  freshId,
  onNewPlan,
  onPickSubject,
}: {
  child: Child
  plans: Curriculum[]
  building: SubjectKey | null
  freshId: string | null
  onNewPlan: () => void
  onPickSubject: (subject: SubjectKey) => void
}) {
  const changes = planChanges(plans)
  const average = averageScore(plans)

  if (plans.length === 0 && !building) {
    return <FirstPlan name={child.name} onNewPlan={onNewPlan} onPickSubject={onPickSubject} />
  }

  return (
    <div className="stagger flex flex-col gap-[18px] md:gap-6">
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Stat value={String(lessonsThisWeek(plans))} label="lessons this week" />
        <Stat value={average === null ? '–' : `${Math.round(average * 100)}%`} label="average quiz score" />
        <Stat value={String(changes.length)} label={changes.length === 1 ? 'plan change' : 'plan changes'} />
      </div>

      {building && <Building subject={building} />}

      <div className="grid gap-[18px] lg:grid-cols-[1.2fr_1fr] lg:items-start lg:gap-6">
        <section className="cardx px-4 py-3.5 md:px-5 md:py-[18px] lg:order-2" aria-labelledby="changed-title">
          <h2 id="changed-title" className="mb-1 text-[17px] font-extrabold md:text-[19px]">
            What changed
          </h2>
          {changes.length === 0 ? (
            <p className="sm border-t border-border" style={{ padding: '12px 0' }}>
              Nothing yet. After a few quizzes the plan adjusts itself, and the reason shows up here.
            </p>
          ) : (
            changes.slice(0, 4).map((change) => <ChangeRow key={change.id} change={change} />)
          )}
        </section>

        <section className="flex flex-col gap-2.5 lg:order-1" aria-labelledby="plans-title">
          <div className="flex items-baseline justify-between">
            <h2 id="plans-title" className="text-[17px] font-extrabold md:text-[19px]">
              Plans
            </h2>
            <Link href="/app/progress" className="sm rounded px-1" style={{ color: 'var(--link)', fontWeight: 700 }}>
              {child.name}’s progress →
            </Link>
          </div>
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} fresh={plan.id === freshId} />
          ))}
        </section>
      </div>

      <div className="md:hidden">
        <Button block onClick={onNewPlan}>
          <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
          New plan
        </Button>
      </div>
    </div>
  )
}

export function HomePage() {
  const { childId, setChildId } = useSession()
  const [tab, setTab] = useState<Tab>(readTab)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<PlanDraft>(EMPTY_DRAFT)
  const [building, setBuilding] = useState<SubjectKey | null>(null)
  const [buildError, setBuildError] = useState('')
  const [freshId, setFreshId] = useState<string | null>(null)

  const children = useResource(api.listChildren)
  const load = useCallback(() => loadPlans(childId!), [childId])
  const plans = useResource(childId ? load : null, isAdjusting)

  const child = children.data?.children.find((candidate) => candidate.id === childId)
  const childMissing = children.data !== null && !child

  useEffect(() => {
    if (childMissing) setChildId(null)
  }, [childMissing, setChildId])

  function changeTab(next: Tab) {
    setTab(next)
    try {
      localStorage.setItem(TAB_KEY, next)
    } catch {}
  }

  function openDialog() {
    setBuildError('')
    setDialogOpen(true)
  }

  function openForSubject(subject: SubjectKey) {
    setDraft({ ...EMPTY_DRAFT, subject })
    openDialog()
  }

  async function build() {
    if (!childId) return
    const current = draft
    const goal = current.goal.trim()
    setDialogOpen(false)
    setBuilding(current.subject)
    setBuildError('')
    try {
      const result = await api.createCurriculum({
        childId,
        prompt: subjectKey(goal) === current.subject ? goal : `${goal} (${SUBJECTS[current.subject].label})`,
        bookId: current.bookId,
        clarifications: current.questions.map((question, at) => ({
          question,
          answer: (current.answers[at] ?? '').trim(),
        })),
      })
      if (result.status === 'needs_clarification') {
        setDraft({ ...current, questions: result.questions, answers: result.questions.map(() => '') })
        setDialogOpen(true)
      } else {
        setDraft(EMPTY_DRAFT)
        setFreshId(result.curriculum.id)
        plans.reload()
      }
    } catch {
      setBuildError('The plan could not be built. Check the goal and try again.')
      setDialogOpen(true)
    } finally {
      setBuilding(null)
    }
  }

  const error = children.error ?? plans.error
  const ready = child && plans.data

  return (
    <div className="flex w-full flex-col gap-[18px] md:gap-[26px]">
      <div className="flex items-center justify-between gap-4">
        <Tabs tab={tab} onChange={changeTab} />
        {tab === 'parents' && ready && (
          <div className="a-fade hidden md:block">
            <Button size="sm" style={{ height: 48, padding: '0 22px' }} onClick={openDialog}>
              <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
              New plan
            </Button>
          </div>
        )}
      </div>

      <div id="home-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {error ? (
          <StatusNote tone="error">{error}</StatusNote>
        ) : !ready ? (
          <Skeleton tab={tab} />
        ) : (
          <div key={tab} className={tab === 'parents' ? 'a-step' : 'a-step-back'}>
            {tab === 'lessons' ? (
              <LessonsTab child={child} plans={plans.data!} building={building} freshId={freshId} onNewPlan={openDialog} />
            ) : (
              <ParentsTab
                child={child}
                plans={plans.data!}
                building={building}
                freshId={freshId}
                onNewPlan={openDialog}
                onPickSubject={openForSubject}
              />
            )}
          </div>
        )}
      </div>

      {dialogOpen && child && (
        <NewPlanDialog
          childName={child.name}
          draft={draft}
          error={buildError}
          onChange={setDraft}
          onBuild={build}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}
