'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/Button'
import { saveQuiz } from '@/lib/api'
import { useSession } from '@/lib/session'
import type { QuizAnswers } from '@/lib/session'
import { QUESTIONS } from './questions'
import type { Question } from './questions'

function isAnswered(question: Question, answer: QuizAnswers[string] | undefined) {
  if (question.type === 'text') return question.optional || Boolean((answer as string)?.trim())
  if (question.type === 'multi') return Array.isArray(answer) && answer.length > 0
  return Boolean(answer)
}

export function QuizPage() {
  const router = useRouter()
  const { setQuiz } = useSession()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<QuizAnswers>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)

  const question = QUESTIONS[step]
  const answer = answers[question.id]
  const isLast = step === QUESTIONS.length - 1
  const canContinue = isAnswered(question, answer)

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  const setAnswer = (value: QuizAnswers[string]) =>
    setAnswers((prev) => ({ ...prev, [question.id]: value }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canContinue) return
    if (!isLast) {
      setStep(step + 1)
      return
    }

    setSaving(true)
    setError('')
    try {
      await saveQuiz(answers)
      setQuiz(answers)
      router.push('/app')
    } catch {
      setError('Could not save your answers. Try again.')
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8">
      <div
        role="progressbar"
        aria-label="Quiz progress"
        aria-valuemin={1}
        aria-valuemax={QUESTIONS.length}
        aria-valuenow={step + 1}
        className="h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-muted">
        Question {step + 1} of {QUESTIONS.length}
      </p>

      <form onSubmit={handleSubmit} className="mt-10 flex flex-1 flex-col">
        <fieldset className="min-w-0">
          <legend className="w-full">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight outline-none"
            >
              {question.title}
            </h1>
            {question.hint && <p className="mt-2 text-muted">{question.hint}</p>}
          </legend>

          <div className="mt-6 space-y-3">
            {question.type === 'text' ? (
              <textarea
                aria-label={question.title}
                rows={4}
                value={(answer as string) ?? ''}
                placeholder={question.placeholder}
                onChange={(event) => setAnswer(event.target.value)}
                className="block w-full rounded-lg border border-border bg-surface p-3 text-base outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              />
            ) : (
              question.options.map((option) => {
                const selected =
                  question.type === 'multi'
                    ? Array.isArray(answer) && answer.includes(option.value)
                    : answer === option.value

                const toggle = () => {
                  if (question.type === 'single') return setAnswer(option.value)
                  const current = Array.isArray(answer) ? answer : []
                  setAnswer(
                    selected ? current.filter((v) => v !== option.value) : [...current, option.value],
                  )
                }

                return (
                  <label
                    key={option.value}
                    className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition has-checked:border-accent has-checked:ring-1 has-checked:ring-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
                  >
                    <input
                      type={question.type === 'multi' ? 'checkbox' : 'radio'}
                      name={question.id}
                      value={option.value}
                      checked={selected}
                      onChange={toggle}
                      className="size-4 accent-(--accent)"
                    />
                    <span>{option.label}</span>
                  </label>
                )
              })
            )}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-10">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={saving}>
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={!canContinue || saving}>
            {isLast ? (saving ? 'Saving…' : 'Finish') : 'Continue'}
          </Button>
        </div>
      </form>
    </main>
  )
}
