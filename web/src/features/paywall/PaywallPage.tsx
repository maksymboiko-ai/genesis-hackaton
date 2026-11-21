'use client'

import { Check, Lock } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { SubjectTile } from '@/components/SubjectTile'
import { Wordmark } from '@/components/Wordmark'
import { api } from '@/lib/api'
import { PRICING } from '@/lib/config'
import { subjectClass, subjectKey } from '@/lib/subjects'
import { useResource } from '@/lib/useResource'

const PREVIEW = 3

type Billing = 'yearly' | 'monthly'

export function PaywallPage() {
  const router = useRouter()
  const planId = useSearchParams().get('plan')
  const [billing, setBilling] = useState<Billing>('yearly')
  const [starting, setStarting] = useState(false)

  const loadPlan = useCallback(() => api.getCurriculum(planId!), [planId])
  const plan = useResource(planId ? loadPlan : null)
  const children = useResource(api.listChildren)

  const target = planId ? `/app/curricula/${planId}` : '/app'

  useEffect(() => {
    if (!planId || plan.error) router.replace('/app')
  }, [planId, plan.error, router])

  if (!plan.data) {
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
  const lessons = curriculum.lessons
  const rest = lessons.length - PREVIEW
  const price = billing === 'yearly' ? PRICING.yearly : PRICING.monthly

  const options: { value: Billing; label: string; price: string; badge?: string }[] = [
    { value: 'yearly', label: 'Yearly', price: PRICING.yearly, badge: PRICING.yearlySaving },
    { value: 'monthly', label: 'Monthly', price: PRICING.monthly },
  ]

  return (
    <main className={`${subjectClass(curriculum.subject)} flex min-h-dvh flex-col`}>
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
                {at === 0 && (
                  <span className="chip sm-chip ml-auto bg-sci-tint text-sci-ink" style={{ minHeight: 26, fontSize: 12 }}>
                    Free
                  </span>
                )}
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

        <div className="a-rise mt-auto flex flex-col gap-2.5 pb-6 md:mt-0 md:gap-3" style={{ animationDelay: '150ms' }}>
          <h2 className="mb-1.5 hidden text-2xl leading-tight font-extrabold tracking-[-0.02em] md:block">Choose a plan</h2>
          <div role="radiogroup" aria-label="Choose a plan" className="flex flex-col gap-2.5 md:gap-3">
            {options.map((option) => {
              const on = billing === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setBilling(option.value)}
                  className={`opt ${on ? 'on' : ''}`}
                  style={{ minHeight: 72 }}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      {option.label}
                      {option.badge && (
                        <span className="chip bg-sun text-text" style={{ minHeight: 24, padding: '0 8px', fontSize: 12 }}>
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
            block
            busy={starting}
            className="mt-2"
            onClick={() => {
              setStarting(true)
              router.push(target)
            }}
          >
            Start {PRICING.trial} free trial
          </Button>
          <p className="sm text-center">Then {price}. Cancel anytime. We’ll remind you before the trial ends.</p>
          <Button variant="ghost" block onClick={() => router.push(target)} style={{ height: 44 }}>
            Try lesson 1 first
          </Button>
        </div>
      </div>
    </main>
  )
}
