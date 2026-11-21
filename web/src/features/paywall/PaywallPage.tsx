'use client'

import { ArrowRight, Check, Lock } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { StatusNote } from '@/components/StatusNote'
import { SubjectTile } from '@/components/SubjectTile'
import { Wordmark } from '@/components/Wordmark'
import { hasFullAccess } from '@/lib/access'
import { api } from '@/lib/api'
import { PRICING } from '@/lib/config'
import { subjectClass, subjectKey } from '@/lib/subjects'
import { useResource } from '@/lib/useResource'
import { BILLINGS, OFFERS } from './billing'
import type { Billing } from './billing'

const PREVIEW = 3


export function PaywallPage() {
  const router = useRouter()
  const planId = useSearchParams().get('plan')
  const [billing, setBilling] = useState<Billing>('yearly')
  const [starting, setStarting] = useState(false)

  const loadPlan = useCallback(() => api.getCurriculum(planId!), [planId])
  const plan = useResource(planId ? loadPlan : null)
  const children = useResource(api.listChildren)
  const account = useResource(api.getSubscription)

  const target = planId ? `/app/curricula/${planId}` : '/app'
  const subscription = account.data?.subscription ?? null
  // Nothing to sell to an account that already opens every lesson.
  const open = hasFullAccess(subscription)

  useEffect(() => {
    if (!planId || plan.error) router.replace('/app')
    else if (open) router.replace(target)
  }, [planId, plan.error, open, target, router])

  if (!plan.data || account.loading || open) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[624px] flex-col gap-5 px-6 pt-9">
        <span className="sk h-[52px] w-3/4" />
        <span className="sk h-[150px] w-full rounded-[18px]" />
        <span className="sk h-[72px] w-full rounded-[16px]" />
        <span className="sk h-[72px] w-full rounded-[16px]" />
      </main>
    )
  }

  const curriculum = plan.data
  const child = children.data?.children.find((candidate) => candidate.id === curriculum.childId)
  const lessons = [...curriculum.lessons].sort((a, b) => a.position - b.position)
  // The account's one trial is over and nothing was paid.
  const trialEnded = subscription
    ? new Date(subscription.trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : null
  const rest = lessons.length - PREVIEW
  const note =
    billing === 'trial'
      ? `Nothing to pay today. Then ${PRICING.monthly} after ${PRICING.trialDays} days. Cancel anytime.`
      : 'Cancel anytime.'

  return (
    <main className={`${subjectClass(curriculum.subject)} paywall flex min-h-dvh flex-col`}>
      <div className="hidden px-8 py-5 md:block">
        <Wordmark />
      </div>
      <div className="mx-auto flex w-full max-w-[624px] flex-1 flex-col gap-5 px-6 pt-9 md:grid md:max-w-[996px] md:flex-none md:content-start md:grid-cols-[460px_400px] md:justify-center md:gap-[72px] md:px-8 md:pt-10">
        <div className="stagger flex flex-col gap-5 md:gap-[22px]">
          <div className="flex items-center gap-3.5">
            <SubjectTile subject={subjectKey(curriculum.subject)} size={52} />
            <div className="flex flex-col gap-0.5">
              <h1 className="q" style={{ fontSize: 26 }}>
                {child ? `${child.name}’s plan is ready` : 'The plan is ready'}
              </h1>
              <p className="sm">
                {curriculum.title} · {lessons.length} lessons
              </p>
            </div>
          </div>

          <ol className="flex flex-col gap-1 rounded-[18px] bg-surface-2 px-4 py-3.5">
            {lessons.slice(0, PREVIEW).map((lesson, at) => (
              <li key={lesson.id} className="flex min-h-10 items-center gap-3">
                {at === 0 ? (
                  <span className="size-7 flex-none rounded-full border-[3px] border-s bg-white" />
                ) : (
                  <span className="grid size-7 flex-none place-items-center rounded-full text-muted">
                    <Lock size={16} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                )}
                <span className={`text-[15px] leading-snug font-bold ${at === 0 ? '' : 'text-muted'}`}>
                  {at + 1} · {lesson.title}
                  {at > 0 && <span className="sr-only"> (locked)</span>}
                </span>
              </li>
            ))}
            {rest > 0 && (
              <li className="sm pl-10">
                + {rest} more {rest === 1 ? 'lesson' : 'lessons'}
              </li>
            )}
          </ol>
          <p className="sub hidden md:block">
            Every plan adjusts after the quizzes, in any subject, for every child on your account.
          </p>
        </div>

        {trialEnded ? (
          <div className="a-rise mt-auto flex flex-col gap-2.5 pb-6 md:mt-0 md:gap-3" style={{ animationDelay: '150ms' }}>
            <h2 className="mb-1.5 text-2xl leading-tight font-extrabold tracking-[-0.02em]">Your free trial has ended</h2>
            <StatusNote>
              The {PRICING.trial} trial ended on {trialEnded}. Paid plans are not open yet, so only the first lesson of
              each plan can be opened.
            </StatusNote>
            <Button variant="ghost" block onClick={() => router.push(target)} style={{ height: 44 }}>
              Back to the plan
            </Button>
          </div>
        ) : (
          <div className="a-rise mt-auto flex flex-col gap-2.5 pb-6 md:mt-0 md:gap-3" style={{ animationDelay: '150ms' }}>
            <h2 className="mb-1.5 hidden text-2xl leading-tight font-extrabold tracking-[-0.02em] md:block">Choose a plan</h2>
            <div role="radiogroup" aria-label="Choose a plan" className="flex flex-col gap-2.5 md:gap-3">
              {BILLINGS.map((value) => {
                const option = OFFERS[value]
                const on = billing === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setBilling(value)}
                    className={`opt ${on ? 'on' : ''}`}
                    style={{ minHeight: 72 }}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        {option.label}
                        {option.badge && (
                          <span
                            className="chip bg-sun-tint text-sun-ink"
                            style={{ minHeight: 24, padding: '0 8px', fontSize: 12, boxShadow: 'inset 0 0 0 1px var(--sun)' }}
                          >
                            {option.badge}
                          </span>
                        )}
                      </span>
                      <span className="sm">{option.price}</span>
                    </span>
                    <span className="rd">{on && <Check size={14} strokeWidth={3.5} aria-hidden="true" />}</span>
                  </button>
                )
              })}
            </div>
            <Button
              variant="sun"
              block
              busy={starting}
              className="mt-2"
              onClick={() => {
                setStarting(true)
                router.push(`/paywall/checkout?plan=${curriculum.id}&billing=${billing}`)
              }}
            >
              Continue
              <ArrowRight size={20} strokeWidth={2.4} aria-hidden="true" />
            </Button>
            <p className="sm text-center">{note}</p>
          </div>
        )}
      </div>
    </main>
  )
}
