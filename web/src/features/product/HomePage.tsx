'use client'

import { QUESTIONS } from '@/features/quiz/questions'
import { useSession } from '@/lib/session'

export function HomePage() {
  const { user, quiz } = useSession()

  const labelFor = (questionId: string, value: string) => {
    const question = QUESTIONS.find((q) => q.id === questionId)
    if (!question || question.type === 'text') return value
    return question.options.find((o) => o.value === value)?.label ?? value
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user?.name}</h1>
      <p className="mt-2 text-muted">The product goes here.</p>

      <section className="mt-8 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-medium">Your quiz answers</h2>
        <dl className="mt-4 space-y-4">
          {QUESTIONS.map((question) => {
            const answer = quiz?.[question.id]
            const values = (Array.isArray(answer) ? answer : [answer ?? '']).filter(Boolean)
            return (
              <div key={question.id}>
                <dt className="text-sm text-muted">{question.title}</dt>
                <dd className="mt-1">
                  {values.length ? values.map((v) => labelFor(question.id, v)).join(', ') : '—'}
                </dd>
              </div>
            )
          })}
        </dl>
      </section>
    </>
  )
}
