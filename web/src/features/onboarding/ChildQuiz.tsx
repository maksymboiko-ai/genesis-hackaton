'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/Button'
import { ChoiceOption } from '@/components/ChoiceOption'
import type { Child } from '@/contracts/domain'
import { api } from '@/lib/api'

const GRADES = Array.from({ length: 12 }, (_, index) => index + 1)
const STEPS = 2

export function ChildQuiz({ onDone, onCancel }: { onDone: (child: Child) => void; onCancel?: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [gradeLevel, setGradeLevel] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)

  const isLast = step === STEPS - 1
  const canContinue = step === 0 ? name.trim().length > 0 : gradeLevel !== null

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

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
      onDone(await api.createChild({ name: name.trim(), gradeLevel: gradeLevel! }))
    } catch {
      setError('Could not save the learner. Try again.')
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8">
      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={1}
        aria-valuemax={STEPS}
        aria-valuenow={step + 1}
        className="h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${((step + 1) / STEPS) * 100}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-muted">
        Step {step + 1} of {STEPS}
      </p>

      <form onSubmit={handleSubmit} className="mt-10 flex flex-1 flex-col">
        <fieldset className="min-w-0">
          <legend className="w-full">
            <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
              {step === 0 ? 'Who is learning?' : `What grade is ${name.trim()} in?`}
            </h1>
            {step === 0 && <p className="mt-2 text-muted">Lessons are written for this learner.</p>}
          </legend>

          {step === 0 ? (
            <input
              aria-label="Learner's name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="First name"
              autoComplete="off"
              className="mt-6 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
          ) : (
            <div className="mt-6 grid grid-cols-4 gap-3">
              {GRADES.map((grade) => (
                <ChoiceOption
                  key={grade}
                  name="gradeLevel"
                  value={String(grade)}
                  checked={gradeLevel === grade}
                  onChange={() => setGradeLevel(grade)}
                  compact
                >
                  {grade}
                </ChoiceOption>
              ))}
            </div>
          )}
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
          ) : onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
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
