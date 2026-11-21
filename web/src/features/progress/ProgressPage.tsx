'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { StatusNote } from '@/components/StatusNote'
import { SubjectTile } from '@/components/SubjectTile'
import type { SkillMastery } from '@/contracts/domain'
import {
  averageScore,
  dayLabel,
  doneLessons,
  isAdjusting,
  loadPlans,
  planChanges,
  skillLabel,
} from '@/features/product/data'
import type { PlanChange } from '@/features/product/data'
import '@/features/product/product.css'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { SUBJECTS, SUBJECT_KEYS, subjectKey } from '@/lib/subjects'
import type { SubjectKey } from '@/lib/subjects'
import { useResource } from '@/lib/useResource'

const GETTING_THERE = 0.4
const STRONG = 0.75
const TIMELINE_PREVIEW = 4

const band = (mastery: number) =>
  mastery >= STRONG ? 'Strong' : mastery >= GETTING_THERE ? 'Getting there' : 'Needs work'

async function loadProgress(childId: string) {
  const [children, profile, plans] = await Promise.all([
    api.listChildren(),
    api.getProfile(childId),
    loadPlans(childId),
  ])
  return { child: children.children.find((child) => child.id === childId) ?? null, profile, plans }
}

type Progress = Awaited<ReturnType<typeof loadProgress>>

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

function SkillRow({ skill, delay }: { skill: SkillMastery; delay: number }) {
  return (
    <div className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] leading-snug font-semibold">{skillLabel(skill.skill)}</span>
        <span className="flex-none text-sm font-bold">
          {band(skill.mastery)} <span className="font-mono text-[13px] font-semibold text-muted">{skill.mastery.toFixed(2)}</span>
        </span>
      </div>
      <div
        className="meter"
        role="meter"
        aria-label={`${skillLabel(skill.skill)}: ${band(skill.mastery)}`}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Number(skill.mastery.toFixed(2))}
      >
        <i className="fill" style={{ width: `${skill.mastery * 100}%`, animationDelay: `${delay}ms` }} />
        <i className="tick" style={{ left: `${GETTING_THERE * 100}%` }} />
        <i className="tick" style={{ left: `${STRONG * 100}%` }} />
      </div>
    </div>
  )
}

function SubjectCard({ subject, skills }: { subject: SubjectKey; skills: SkillMastery[] }) {
  const sorted = [...skills].sort((a, b) => a.mastery - b.mastery)
  const strong = sorted.filter((skill) => skill.mastery >= STRONG).length
  const working = sorted.length - strong
  const summary =
    sorted.length === 0
      ? 'Just started'
      : [strong > 0 && `Strong in ${strong}`, working > 0 && `working on ${working}`]
          .filter(Boolean)
          .join(' · ')
          .replace(/^w/, 'W')

  return (
    <section className={`cardx flex flex-col gap-1 px-[18px] py-4 ${SUBJECTS[subject].className}`}>
      <div className="flex items-center gap-3 pb-1.5">
        <SubjectTile subject={subject} size={40} />
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[17px] font-extrabold">{SUBJECTS[subject].label}</h3>
          <span className="sm">{summary}</span>
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className="sm" style={{ padding: '6px 0 2px' }}>
          Skills show up after the first quiz.
        </p>
      ) : (
        sorted.map((skill, index) => (
          <SkillRow key={`${skill.subject}/${skill.skill}`} skill={skill} delay={120 + index * 60} />
        ))
      )}
    </section>
  )
}

function Timeline({ changes }: { changes: PlanChange[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? changes : changes.slice(0, TIMELINE_PREVIEW)

  return (
    <section className="cardx px-[18px] py-4" aria-labelledby="changes-title">
      <h2 id="changes-title" className="mb-1 text-[17px] font-extrabold">
        Plan changes
      </h2>
      {changes.length === 0 && (
        <p className="sm" style={{ padding: '8px 0' }}>
          None yet. After three quizzes in a plan, the app adds review or a challenge and notes why here.
        </p>
      )}
      {shown.map((change) => (
        <Link
          key={change.id}
          href={`/app/curricula/${change.plan.id}`}
          className="a-rise -mx-2 grid grid-cols-[72px_12px_minmax(0,1fr)] gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2"
        >
          <span className="sm" style={{ paddingTop: 2 }}>
            {dayLabel(change.event.createdAt)}
          </span>
          <span className="relative">
            <i
              className="absolute top-1.5 left-px block size-2.5 rounded-full"
              style={{ background: change.good ? 'var(--challenge)' : 'var(--sun)' }}
            />
          </span>
          <span className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-2 text-[15px] leading-snug font-bold">
              <SubjectTile subject={subjectKey(change.plan.subject)} size={22} />
              {change.title}
            </span>
            <span className="sm">
              {change.plan.title} · {change.detail}
            </span>
          </span>
        </Link>
      ))}
      {changes.length > TIMELINE_PREVIEW && (
        <button
          type="button"
          className="sm inline-flex min-h-10 items-center rounded px-1"
          style={{ color: 'var(--link)', fontWeight: 700 }}
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? 'Show fewer' : `Show all ${changes.length}`}
        </button>
      )}
    </section>
  )
}

function Loading() {
  return (
    <div className="a-fade flex flex-col gap-[18px]" aria-busy="true" aria-label="Loading">
      <span className="sk" style={{ width: 240, height: 32, borderRadius: 10 }} />
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        {[0, 1, 2].map((item) => (
          <span key={item} className="sk" style={{ height: 82, borderRadius: 20 }} />
        ))}
      </div>
      <div className="grid gap-[18px] lg:grid-cols-[1.25fr_1fr] lg:gap-6">
        <span className="sk" style={{ height: 280, borderRadius: 20 }} />
        <span className="sk" style={{ height: 200, borderRadius: 22 }} />
      </div>
    </div>
  )
}

function Content({ child, profile, plans }: Progress & { child: NonNullable<Progress['child']> }) {
  const changes = planChanges(plans)
  const average = averageScore(plans)
  const done = plans.flatMap(doneLessons).length

  const bySubject = new Map<SubjectKey, SkillMastery[]>()
  plans.forEach((plan) => bySubject.set(subjectKey(plan.subject), bySubject.get(subjectKey(plan.subject)) ?? []))
  profile.mastery.forEach((skill) => {
    const key = subjectKey(skill.subject)
    bySubject.set(key, [...(bySubject.get(key) ?? []), skill])
  })
  const subjects = SUBJECT_KEYS.filter((key) => bySubject.has(key))
  const empty = profile.mastery.length === 0
  const notes = profile.notes.trim()

  return (
    <div className="stagger flex flex-col gap-[18px] md:gap-6">
      <h1 className="q">{child.name}’s progress</h1>

      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Stat value={String(done)} label={done === 1 ? 'lesson done' : 'lessons done'} />
        <Stat value={average === null ? '–' : `${Math.round(average * 100)}%`} label="average quiz score" />
        <Stat value={String(changes.length)} label={changes.length === 1 ? 'plan change' : 'plan changes'} />
      </div>

      {empty && (
        <div className="flex flex-col gap-2.5 rounded-[22px] bg-surface-2 p-[22px]">
          <p className="text-lg leading-snug font-bold">Nothing to show yet</p>
          <p className="sub" style={{ fontSize: 16 }}>
            After {child.name}’s first quiz the skills show up here. After three, the app starts noting how{' '}
            {child.name} learns.
          </p>
          {plans.length === 0 && (
            <Link href="/app" className="btn sm-btn self-start">
              Make the first plan
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-[18px] lg:grid-cols-[1.25fr_1fr] lg:items-start lg:gap-6">
        {subjects.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="mt-2 text-xl font-extrabold lg:mt-0">Skills</h2>
            {subjects.map((key) => (
              <SubjectCard key={key} subject={key} skills={bySubject.get(key)!} />
            ))}
            <p className="sm">
              Bars show mastery from 0 to 1. Ticks mark “getting there” ({GETTING_THERE}) and “strong” ({STRONG}).
            </p>
          </div>
        )}

        <div className={`flex flex-col gap-[18px] ${subjects.length === 0 ? 'lg:col-span-2' : 'lg:pt-10'}`}>
          <section className="flex flex-col gap-2.5 rounded-[22px] bg-sun-tint px-5 py-[18px]" aria-labelledby="learns-title">
            <h2 id="learns-title" className="text-[17px] font-extrabold">
              How {child.name} learns
            </h2>
            <p className="text-base leading-relaxed">
              {notes || `Not enough quizzes yet. After three, a short note on how ${child.name} learns best appears here.`}
            </p>
            <p className="sm" style={{ color: 'var(--sun-ink)' }}>
              Used in every new plan, in any subject.
            </p>
          </section>
          <Timeline changes={changes} />
        </div>
      </div>
    </div>
  )
}

export function ProgressPage() {
  const { childId } = useSession()
  const load = useCallback(() => loadProgress(childId!), [childId])
  const pollWhile = useCallback((data: Progress) => isAdjusting(data.plans), [])
  const { data, error } = useResource(childId ? load : null, pollWhile)

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3">
      <Link href="/app" className="btn q sm-btn -ml-3 self-start" style={{ height: 44, padding: '0 12px 0 8px', gap: 4 }}>
        <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
        Home
      </Link>
      {error ? (
        <StatusNote tone="error">{error}</StatusNote>
      ) : !data ? (
        <Loading />
      ) : !data.child ? (
        <StatusNote tone="error">This learner could not be found.</StatusNote>
      ) : (
        <Content {...data} child={data.child} />
      )}
    </div>
  )
}
