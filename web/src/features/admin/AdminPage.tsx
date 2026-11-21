'use client'

import { Check, Clock, RefreshCw, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button } from '@/components/Button'
import { StatusNote } from '@/components/StatusNote'
import { Wordmark } from '@/components/Wordmark'
import type { AdminAnalyticsResponse } from '@/contracts/api'
import { PILOT_WEEKS } from '@/contracts/domain'
import '@/features/product/product.css'
import { api } from '@/lib/api'
import { APP_NAME } from '@/lib/config'
import { useResource } from '@/lib/useResource'
import './admin.css'

type Analytics = AdminAnalyticsResponse

const count = (value: number) => value.toLocaleString('en-US')
const percent = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)}%`)
const seconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)
const compact = (value: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const plural = (value: number, one: string, many = `${one}s`) => `${count(value)} ${value === 1 ? one : many}`

const TASK_LABELS: Record<string, string> = {
  outline: 'Plan outline',
  extend: 'Plan extension',
  lesson: 'Lesson',
  replan: 'Replan',
  learner_notes: 'Learner notes',
  book_map: 'Book map',
  feedback: 'Quiz feedback',
  embed: 'Embedding',
}

function shortDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Where a number stands against its goal: an icon and words, never color alone. */
function Standing({ value, goal }: { value: number | null; goal: number }) {
  if (value === null) {
    return (
      <span className="chip sm-chip bg-surface-2 text-muted">
        <Clock size={14} strokeWidth={2.4} aria-hidden="true" />
        No data yet
      </span>
    )
  }
  if (value >= goal) {
    return (
      <span className="chip sm-chip bg-sci-tint text-sci-ink">
        <Check size={14} strokeWidth={3} aria-hidden="true" />
        Goal met
      </span>
    )
  }
  return (
    <span className="chip sm-chip bg-sun-tint text-sun-ink">
      <TrendingDown size={14} strokeWidth={2.4} aria-hidden="true" />
      Below goal
    </span>
  )
}

/** A 0 to 1 bar with a tick at the goal. */
function Meter({ value, goal, label }: { value: number | null; goal?: number; label: string }) {
  return (
    <div
      className="meter"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? 0 : Math.round(value * 100)}
      aria-valuetext={percent(value)}
    >
      <i className="fill" style={{ width: `${Math.min(1, value ?? 0) * 100}%` }} />
      {goal !== undefined && <i className="tick admin-goal" style={{ left: `${goal * 100}%` }} />}
    </div>
  )
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="text-xl font-extrabold tracking-[-0.02em]">
          {title}
        </h2>
        {note && <p className="sm">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function Stat({ value, label, detail }: { value: string; label: string; detail?: string }) {
  return (
    <div className="cardx flex flex-col gap-1.5 p-3.5 md:p-[18px]">
      <p className="stat-n">{value}</p>
      <p className="text-sm leading-snug font-semibold">{label}</p>
      {detail && <p className="sm">{detail}</p>}
    </div>
  )
}

function GapsHero({ gaps }: { gaps: Analytics['gaps'] }) {
  const open = gaps.found - gaps.tested
  return (
    <section aria-labelledby="gaps-title" className="cardx flex flex-col gap-5 p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="cap text-muted">Key metric</p>
          <h2 id="gaps-title" className="text-xl font-extrabold tracking-[-0.02em]">
            Learning gaps closed
          </h2>
        </div>
        <Standing value={gaps.rate} goal={gaps.target} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="admin-hero">{percent(gaps.rate)}</p>
            <p className="sub">
              goal {percent(gaps.target)} in {PILOT_WEEKS} weeks
            </p>
          </div>
          <Meter value={gaps.rate} goal={gaps.target} label="Learning gaps closed" />
          <p className="sm">
            {gaps.found === 0
              ? 'No gaps found yet. The app finds one when a child struggles through three quizzes and it adds a review lesson.'
              : `${plural(gaps.closed, 'gap')} closed of ${count(gaps.found)} found. ${count(gaps.tested)} tested so far, ${count(open)} still waiting for the child.`}
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-2 self-start md:gap-3">
          {[
            { label: 'Found', value: gaps.found, detail: 'review lessons added' },
            { label: 'Tested', value: gaps.tested, detail: 'review quiz taken' },
            { label: 'Closed', value: gaps.closed, detail: `first try ${percent(gaps.closedFrom)} or more` },
          ].map((step) => (
            <div key={step.label} className="flex flex-col gap-1 rounded-[14px] bg-surface-2 px-3.5 py-3">
              <dt className="sm font-semibold">{step.label}</dt>
              <dd className="stat-n">{count(step.value)}</dd>
              <dd className="sm">{step.detail}</dd>
            </div>
          ))}
        </dl>
      </div>

      {gaps.bySubject.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <h3 className="text-[15px] font-extrabold">By subject</h3>
          {gaps.bySubject.map((row) => (
            <div key={row.subject} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2 md:grid-cols-[200px_minmax(0,1fr)_150px]">
              <span className="truncate text-[15px] font-semibold">{row.subject}</span>
              <span className="text-right text-sm font-bold md:order-3">
                {percent(row.rate)}{' '}
                <span className="font-mono text-[13px] font-semibold text-muted">
                  {count(row.closed)}/{count(row.found)}
                </span>
              </span>
              <div className="col-span-2 md:order-2 md:col-span-1">
                <Meter value={row.rate} goal={gaps.target} label={`${row.subject}: gaps closed`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Goal({
  title,
  value,
  goalText,
  standing,
  meter,
  children,
}: {
  title: string
  value: string
  goalText: string
  standing: ReactNode
  meter: ReactNode
  children: ReactNode
}) {
  return (
    <div className="cardx flex flex-col gap-3 p-[18px]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] leading-snug font-extrabold">{title}</h3>
        {standing}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <p className="stat-n">{value}</p>
        <p className="sm">{goalText}</p>
      </div>
      {meter}
      <p className="sm">{children}</p>
    </div>
  )
}

function Goals({ data }: { data: Analytics }) {
  const { payment, weekOne, recovery } = data
  const paidShare = payment.paidTarget > 0 ? payment.paid / payment.paidTarget : null
  return (
    <Section id="goals-title" title="Pilot goals and guardrails">
      <div className="grid gap-3 md:grid-cols-3 md:gap-4">
        <Goal
          title="Families paying for the next month"
          value={`${count(payment.paid)} of ${count(payment.paidTarget)}`}
          goalText={`goal, from ${count(payment.familiesTarget)} families`}
          standing={<Standing value={payment.trialsStarted === 0 ? null : payment.paid} goal={payment.paidTarget} />}
          meter={<Meter value={paidShare} goal={1} label="Families paying, against the goal" />}
        >
          {plural(payment.families, 'family', 'families')} in the pilot. {plural(payment.trialsStarted, 'trial')} started,{' '}
          {count(payment.trialsActive)} running.{' '}
          {payment.trialToPaid === null
            ? 'No trial has ended yet.'
            : `Trial to paid ${percent(payment.trialToPaid)} (industry median ${percent(payment.benchmark)}).`}
        </Goal>

        <Goal
          title={`${weekOne.lessonsTarget} lessons in week 1`}
          value={percent(weekOne.rate)}
          goalText="of learners"
          standing={null}
          meter={<Meter value={weekOne.rate} label={`Learners with ${weekOne.lessonsTarget} lessons in week 1`} />}
        >
          {count(weekOne.reached)} of {plural(weekOne.learners, 'learner')} finished {weekOne.lessonsTarget} lessons in
          their first 7 days. {count(weekOne.inFirstWeek)} more still in week 1.
        </Goal>

        <Goal
          title="Failed lessons passed on retry"
          value={percent(recovery.rate)}
          goalText={`target ${percent(recovery.target)}`}
          standing={<Standing value={recovery.rate} goal={recovery.target} />}
          meter={<Meter value={recovery.rate} goal={recovery.target} label="Failed lessons passed on retry" />}
        >
          {count(recovery.passed)} passed of {plural(recovery.taken, 'retry', 'retries')} taken.{' '}
          {count(recovery.scheduled - recovery.taken)} scheduled and not taken yet.
        </Goal>
      </div>
    </Section>
  )
}

function Usage({ usage }: { usage: Analytics['usage'] }) {
  return (
    <Section id="usage-title" title="Usage" note="All time">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4 lg:grid-cols-6">
        <Stat value={count(usage.parents)} label={usage.parents === 1 ? 'Family' : 'Families'} />
        <Stat value={count(usage.learners)} label={usage.learners === 1 ? 'Learner' : 'Learners'} detail={`${count(usage.activeLearners)} active this week`} />
        <Stat value={count(usage.plans)} label={usage.plans === 1 ? 'Plan' : 'Plans'} />
        <Stat value={count(usage.lessonsDone)} label={usage.lessonsDone === 1 ? 'Lesson done' : 'Lessons done'} />
        <Stat value={percent(usage.averageScore)} label="Average quiz score" />
        <Stat
          value={count(usage.replans.struggling + usage.replans.excelling)}
          label="Plan changes"
          detail={`${count(usage.replans.struggling)} review, ${count(usage.replans.excelling)} challenge`}
        />
      </div>
    </Section>
  )
}

function CallsChart({ days }: { days: Analytics['ai']['byDay'] }) {
  const max = Math.max(1, ...days.map((day) => day.calls))
  const total = days.reduce((sum, day) => sum + day.calls, 0)
  return (
    <figure className="cardx flex flex-col gap-3 p-[18px]">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-extrabold">Model calls per day</span>
        <span className="sm">peak {count(max === 1 && total === 0 ? 0 : max)}</span>
      </figcaption>
      <ol className="admin-bars" aria-label={`Model calls per day, last ${days.length} days, UTC`}>
        {days.map((day, index) => (
          <li key={day.day} tabIndex={0} className={index > days.length / 2 ? 'late' : ''}>
            <i style={{ height: day.calls === 0 ? 0 : `max(3px, ${(day.calls / max) * 100}%)` }} />
            <span className="tip">
              <b>{shortDay(day.day)}</b>
              {plural(day.calls, 'call')}
              {day.failed > 0 ? `, ${count(day.failed)} failed` : ''}
            </span>
          </li>
        ))}
      </ol>
      <div className="sm flex justify-between">
        <span>{days.length > 0 && shortDay(days[0].day)}</span>
        <span>{days.length > 0 && shortDay(days[days.length - 1].day)}</span>
      </div>
    </figure>
  )
}

function Ai({ ai }: { ai: Analytics['ai'] }) {
  const failRate = ai.calls === 0 ? null : ai.failed / ai.calls
  const budget = ai.dailyLimit > 0 ? ai.callsLast24h / ai.dailyLimit : null
  const lessonsTotal = ai.lessons.ready + ai.lessons.failed + ai.lessons.waiting
  return (
    <Section id="ai-title" title="AI" note={`Last ${ai.windowDays} days`}>
      <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
        <Stat value={count(ai.calls)} label="Model calls" detail={`${count(ai.callsLast24h)} in the last 24 hours`} />
        <Stat value={percent(failRate)} label="Calls failed" detail={`${count(ai.failed)} of ${count(ai.calls)}`} />
        <Stat value={compact(ai.inputTokens + ai.outputTokens)} label="Tokens" detail={`${compact(ai.inputTokens)} in, ${compact(ai.outputTokens)} out`} />
        <Stat
          value={count(ai.lessons.ready)}
          label="Lessons written"
          detail={lessonsTotal === 0 ? 'None planned yet' : `${count(ai.lessons.failed)} failed, ${count(ai.lessons.waiting)} not written yet`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-4">
        <CallsChart days={ai.byDay} />
        <div className="cardx flex flex-col gap-3 p-[18px]">
          <h3 className="text-[15px] font-extrabold">Daily call budget</h3>
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <p className="stat-n">{percent(budget)}</p>
            <p className="sm">
              {count(ai.callsLast24h)} of {count(ai.dailyLimit)} calls in the last 24 hours
            </p>
          </div>
          <Meter value={budget} label="Daily model call budget used" />
          <p className="sm">When the budget is used up, new plans and lessons wait until calls drop out of the 24 hour window.</p>
        </div>
      </div>

      <div className="cardx overflow-x-auto p-[18px]">
        <table className="admin-table">
          <caption>By task and model</caption>
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Model</th>
              <th scope="col" className="num">Calls</th>
              <th scope="col" className="num">Failed</th>
              <th scope="col" className="num">Median</th>
              <th scope="col" className="num">95th pct.</th>
              <th scope="col" className="num">Tokens in</th>
              <th scope="col" className="num">Tokens out</th>
            </tr>
          </thead>
          <tbody>
            {ai.byTask.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  No model calls in the last {ai.windowDays} days.
                </td>
              </tr>
            )}
            {ai.byTask.map((row) => (
              <tr key={`${row.task}/${row.model}`}>
                <th scope="row">{TASK_LABELS[row.task] ?? row.task}</th>
                <td className="model">{row.model}</td>
                <td className="num">{count(row.calls)}</td>
                <td className="num">
                  {count(row.failed)}
                  {row.failed > 0 && <span className="text-muted"> ({percent(row.failed / row.calls)})</span>}
                </td>
                <td className="num">{seconds(row.medianLatencyMs)}</td>
                <td className="num">{seconds(row.p95LatencyMs)}</td>
                <td className="num">{compact(row.inputTokens)}</td>
                <td className="num">{compact(row.outputTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function Loading() {
  return (
    <div className="a-fade flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <span className="sk" style={{ height: 260, borderRadius: 20 }} />
      <div className="grid gap-3 md:grid-cols-3 md:gap-4">
        {[0, 1, 2].map((item) => (
          <span key={item} className="sk" style={{ height: 170, borderRadius: 20 }} />
        ))}
      </div>
      <span className="sk" style={{ height: 110, borderRadius: 20 }} />
    </div>
  )
}

export function AdminPage() {
  const { data, error, loading, reload } = useResource(api.adminAnalytics)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-3 px-5 md:h-[72px] md:px-10">
          <Link href="/app" aria-label={`${APP_NAME}, home`} className="rounded-lg">
            <Wordmark />
          </Link>
          <Button variant="ghost" size="sm" busy={loading && data !== null} onClick={reload}>
            <RefreshCw size={18} strokeWidth={2.2} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-7 px-5 pt-6 pb-12 md:px-10 md:pt-9">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="q">Pilot analytics</h1>
          {data && (
            <p className="sm">
              Updated{' '}
              {new Date(data.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>

        {error ? (
          <StatusNote tone="error">{error}</StatusNote>
        ) : !data ? (
          <Loading />
        ) : (
          <div className="stagger flex flex-col gap-8">
            <GapsHero gaps={data.gaps} />
            <Goals data={data} />
            <Usage usage={data.usage} />
            <Ai ai={data.ai} />
            <p className="sm max-w-[760px]">
              A gap is found when the plan adds a review lesson after three weak quizzes. It is closed when the child gets{' '}
              {percent(data.gaps.closedFrom)} or more of that lesson’s quiz right on the first try; a retake does not count.
              Numbers cover every family and hold no names.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
