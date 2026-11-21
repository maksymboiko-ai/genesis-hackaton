'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Mascot } from '@/components/Mascot'
import { Wordmark } from '@/components/Wordmark'
import { api } from '@/lib/api'
import { subjectClass } from '@/lib/subjects'
import { useResource } from '@/lib/useResource'
import { OFFERS, nextChargeDate, readReceipt } from './billing'

export function SuccessPage() {
  const router = useRouter()
  const planId = useSearchParams().get('plan')
  // Stage renders this page only in the browser, so sessionStorage is there.
  const [receipt] = useState(readReceipt)
  const [leaving, setLeaving] = useState(false)

  const loadPlan = useCallback(() => api.getCurriculum(planId!), [planId])
  const plan = useResource(planId ? loadPlan : null)
  const children = useResource(api.listChildren)

  useEffect(() => {
    if (!planId || plan.error) router.replace('/app')
    else if (!receipt) router.replace(`/paywall?plan=${planId}`)
  }, [planId, plan.error, receipt, router])

  if (!planId || !receipt) return null

  if (!plan.data) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center gap-4 px-6 pt-20">
        <span className="sk size-[150px] rounded-full!" />
        <span className="sk h-9 w-2/3" />
        <span className="sk h-5 w-4/5" />
      </main>
    )
  }

  const curriculum = plan.data
  const child = children.data?.children.find((candidate) => candidate.id === curriculum.childId)
  const count = curriculum.lessons.length
  const first = [...curriculum.lessons].sort((a, b) => a.position - b.position)[0]
  const offer = OFFERS[receipt.billing]
  const trial = receipt.billing === 'trial'
  const whose = child ? `${child.name}’s plan` : 'the plan'

  return (
    <main className={`${subjectClass(curriculum.subject)} flex min-h-dvh flex-col`}>
      <div className="hidden px-8 py-5 md:block">
        <Wordmark />
      </div>
      <div className="a-rise mx-auto flex w-full max-w-[480px] flex-col items-center gap-4 px-6 pt-14 pb-10 text-center md:pt-10">
        <Mascot pose="cheer" size={150} />
        <h1 className="q text-[30px]! md:text-[36px]!">You’re all set</h1>
        <p className="sub">
          {trial
            ? `Your ${offer.label.toLowerCase()} has started. All ${count} lessons in ${whose} are open.`
            : `All ${count} lessons in ${whose} are unlocked.`}
        </p>
        <dl className="mt-1 grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-[18px] bg-surface-2 px-5 py-4 text-left text-[15px]">
          <dt className="text-muted">Plan</dt>
          <dd className="m-0 text-right font-bold">{offer.summary}</dd>
          <dt className="text-muted">Card</dt>
          <dd className="m-0 text-right font-bold">{receipt.last4 ? `Ending ${receipt.last4}` : 'Added'}</dd>
          <dt className="text-muted">{trial ? 'First charge' : 'Renews'}</dt>
          <dd className="m-0 text-right font-bold">{nextChargeDate(receipt.billing)}</dd>
        </dl>
        <Button
          block
          busy={leaving}
          className="mt-3"
          onClick={() => {
            setLeaving(true)
            router.push(first ? `/app/lessons/${first.id}` : `/app/curricula/${curriculum.id}`)
          }}
        >
          Start lesson 1
        </Button>
      </div>
    </main>
  )
}
