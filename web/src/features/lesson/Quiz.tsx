'use client'

import { ChevronLeft } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button } from '@/components/Button'
import type { PublicQuestion } from '@/contracts/api'
import { LETTERS, isMathy, shortPrompt, splitPrompt } from './text'

type Props = {
  questions: PublicQuestion[]
  answers: Record<string, number>
  onAnswer: (questionId: string, choice: number) => void
  onExit: () => void
  onSubmit: () => void
  submitting: boolean
  error: string
  passage: string[]
}

export function Quiz({ questions, answers, onAnswer, onExit, onSubmit, submitting, error, passage }: Props) {
  const total = questions.length
  const [index, setIndex] = useState(0)
  const [back, setBack] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)

  const checking = index >= total
  const question = checking ? null : questions[index]
  const chosen = question ? answers[question.id] : undefined
  const missing = questions.filter((item) => answers[item.id] === undefined)

  const go = (next: number) => {
    setBack(next < index)
    setIndex(Math.max(0, Math.min(total, next)))
  }

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [index])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || submitting) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, summary')) return

      if (event.key === 'Enter') {
        if (target?.closest('[data-own-enter]')) return
        event.preventDefault()
        if (index < total) go(index + 1)
        else if (missing.length === 0) onSubmit()
        return
      }
      if (!question) return
      const choice = LETTERS.indexOf(event.key.toUpperCase())
      const digit = ['1', '2', '3', '4'].indexOf(event.key)
      const picked = choice >= 0 ? choice : digit
      if (picked >= 0 && picked < question.choices.length) onAnswer(question.id, picked)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function onArrow(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!question) return
    const step = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 0
    if (!step) return
    event.preventDefault()
    const count = question.choices.length
    const next = ((chosen ?? (step > 0 ? -1 : 0)) + step + count) % count
    onAnswer(question.id, next)
    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  const parts = question ? splitPrompt(question.prompt) : null
  const mono = question ? question.choices.every(isMathy) : false

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="barbtn -ml-2" onClick={onExit} data-own-enter>
          <ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" />
          Lesson
        </button>
        <span className="sm" aria-live="polite">
          {checking ? (
            'Check your answers'
          ) : (
            <>
              <b className="text-text">{index + 1}</b> of {total}
            </>
          )}
        </span>
      </div>

      <nav className="qdots mt-2" aria-label="Questions">
        {questions.map((item, at) => (
          <button
            key={item.id}
            type="button"
            data-own-enter
            onClick={() => go(at)}
            aria-label={`Question ${at + 1}${answers[item.id] === undefined ? ', not answered' : ', answered'}`}
            aria-current={at === index ? 'step' : undefined}
            className={at === index ? 'cur' : answers[item.id] !== undefined ? 'done' : ''}
          />
        ))}
      </nav>

      {question && parts && (
        <div key={question.id} className={`${back ? 'a-step-back' : 'a-step'} mt-7 flex flex-col gap-5 md:mt-9 md:gap-6`}>
          {passage.length > 0 && (
            <details className="peek">
              <summary data-own-enter>
                The passage
                <span className="when-open">Hide</span>
                <span className="when-closed">Show</span>
              </summary>
              <p>
                {passage.map((line, at) => (
                  <span key={at}>
                    <b>{at + 1}</b>
                    {line}{' '}
                  </span>
                ))}
              </p>
            </details>
          )}

          {parts.lead && <div className="rounded-2xl bg-s-tint px-4 py-3.5 text-base leading-normal font-medium">{parts.lead}</div>}

          {parts.equation && (
            <p className="eq m-0 rounded-[18px] bg-s-tint p-5 text-center text-[28px] md:rounded-[20px] md:p-6 md:text-[38px]">
              {parts.equation}
            </p>
          )}

          <h1 ref={headingRef} tabIndex={-1} id="quiz-question" className="q text-[22px]! outline-none md:text-[28px]!">
            {parts.question}
          </h1>

          <div
            ref={groupRef}
            role="radiogroup"
            aria-labelledby="quiz-question"
            onKeyDown={onArrow}
            className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3"
          >
            {question.choices.map((choice, at) => {
              const on = chosen === at
              return (
                <button
                  key={at}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on || (chosen === undefined && at === 0) ? 0 : -1}
                  onClick={() => onAnswer(question.id, at)}
                  className={`qa ${on ? 'on' : ''}`}
                >
                  <span className="lt2" aria-hidden="true">
                    {LETTERS[at]}
                  </span>
                  <span className={mono ? 'mono' : ''}>{choice}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {checking && (
        <div className={`${back ? 'a-step-back' : 'a-step'} mt-7 flex flex-col gap-5 md:mt-9`}>
          <div className="flex flex-col gap-1.5">
            <h1 ref={headingRef} tabIndex={-1} className="q outline-none">
              {missing.length === 0
                ? `All ${total} answered`
                : `${missing.length} left to answer`}
            </h1>
            <p className="sub">{missing.length === 0 ? 'Tap any to change it.' : 'Tap a question to answer it.'}</p>
          </div>
          <div className="stagger flex flex-col gap-2">
            {questions.map((item, at) => {
              const answer = answers[item.id]
              const text = shortPrompt(item.prompt)
              return (
                <button key={item.id} type="button" data-own-enter className="opt" style={{ minHeight: 56 }} onClick={() => go(at)}>
                  <span className="sm w-5 flex-none">{at + 1}</span>
                  <span className={`min-w-0 flex-1 truncate ${isMathy(text) ? 'mono' : ''}`}>{text}</span>
                  {answer === undefined ? (
                    <span className="k review">To do</span>
                  ) : (
                    <span className="grid size-[34px] flex-none place-items-center rounded-[10px] bg-s-tint text-[15px] font-extrabold text-s-ink">
                      {LETTERS[answer]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {error && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-medium">
              {error}
            </p>
          )}
        </div>
      )}

      <div className="lesson-foot md:mt-8 md:flex-row-reverse md:items-center md:justify-between">
        {checking ? (
          <Button block className="md:w-[220px]!" busy={submitting} disabled={missing.length > 0} onClick={onSubmit} data-own-enter>
            {submitting ? 'Checking…' : 'See how I did'}
          </Button>
        ) : (
          <Button block className="md:w-[200px]!" onClick={() => go(index + 1)} data-own-enter>
            {index === total - 1 ? 'Review answers' : chosen === undefined ? 'Skip for now' : 'Next'}
            <span className="kbd" aria-hidden="true">
              Enter
            </span>
          </Button>
        )}
        <Button
          variant="ghost"
          className="hidden md:inline-flex"
          disabled={index === 0 || submitting}
          onClick={() => go(index - 1)}
          data-own-enter
        >
          Previous
        </Button>
      </div>
      <div className="h-28 md:hidden" aria-hidden="true" />
    </div>
  )
}
