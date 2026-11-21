'use client'

import { AlertCircle, BookOpen, Check, ChevronDown, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react'
import { Button } from '@/components/Button'
import type { ListBooksResponse } from '@/contracts/api'
import { api } from '@/lib/api'
import { SUBJECTS, SUBJECT_KEYS } from '@/lib/subjects'
import type { SubjectKey } from '@/lib/subjects'
import { useResource } from '@/lib/useResource'
import './product.css'

export type PlanDraft = {
  subject: SubjectKey
  goal: string
  bookId: string | null
  questions: string[]
  answers: string[]
}

export const EMPTY_DRAFT: PlanDraft = { subject: 'math', goal: '', bookId: null, questions: [], answers: [] }

const GOAL_MAX = 1900
const hasProcessing = (data: ListBooksResponse) => data.books.some((book) => book.status === 'processing')

function Books({ bookId, onPick }: { bookId: string | null; onPick: (bookId: string | null) => void }) {
  const { data, error, reload } = useResource(api.listBooks, hasProcessing)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Choose a PDF file.')
      return
    }
    setUploading(true)
    setUploadError('')
    try {
      await api.createBook(file.name.replace(/\.pdf$/i, ''), file)
      reload()
    } catch {
      setUploadError('The upload did not go through. Try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-2.5">
      {error && <p className="sm">Your textbooks could not be loaded.</p>}
      {data?.books.map((book) =>
        book.status === 'ready' ? (
          <button
            key={book.id}
            type="button"
            role="checkbox"
            aria-checked={book.id === bookId}
            className={`opt a-rise ${book.id === bookId ? 'on' : ''}`}
            onClick={() => onPick(book.id === bookId ? null : book.id)}
          >
            <span className="book" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate">{book.title}</span>
              <span className="sm" style={{ color: 'var(--sci-ink)', fontWeight: 700 }}>
                Ready
              </span>
            </span>
            <span className="rd">
              <Check size={14} strokeWidth={3.5} aria-hidden="true" />
            </span>
          </button>
        ) : (
          <div key={book.id} className="opt a-rise" style={{ cursor: 'default' }}>
            <span className="book pending" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="truncate">{book.title}</span>
              {book.status === 'processing' ? (
                <>
                  <span className="sm" role="status">
                    Processing. You can keep going.
                  </span>
                  <span className="bar flow-bar s-sci" style={{ height: 5 }}>
                    <i />
                  </span>
                </>
              ) : (
                <span className="sm" style={{ color: 'var(--danger)', fontWeight: 700 }}>
                  We couldn’t read this PDF. Try one with selectable text.
                </span>
              )}
            </span>
          </div>
        ),
      )}
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} onChange={upload} />
      <Button variant="secondary" size="sm" block busy={uploading} onClick={() => fileRef.current?.click()} style={{ height: 48 }}>
        {!uploading && <Upload size={18} strokeWidth={2.4} aria-hidden="true" />}
        {uploading ? 'Uploading…' : 'Upload a PDF'}
      </Button>
      {uploadError && (
        <p role="alert" className="sm flex items-center gap-1.5" style={{ color: 'var(--danger)', fontWeight: 700 }}>
          <AlertCircle size={16} aria-hidden="true" />
          {uploadError}
        </p>
      )}
    </div>
  )
}

export function NewPlanDialog({
  childName,
  draft,
  error,
  onChange,
  onBuild,
  onClose,
}: {
  childName: string
  draft: PlanDraft
  error: string
  onChange: (draft: PlanDraft) => void
  onBuild: () => void
  onClose: () => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [bookOpen, setBookOpen] = useState(draft.bookId !== null)
  const clarifying = draft.questions.length > 0
  const canBuild = clarifying
    ? draft.answers.every((answer) => answer.trim().length > 0)
    : draft.goal.trim().length > 0

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('textarea, input[type="text"]')?.focus()
  }, [clarifying])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = [
        ...event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), textarea, input:not([tabindex="-1"]), a[href]',
        ),
      ].filter((item) => item.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  function submit(event: FormEvent) {
    event.preventDefault()
    if (canBuild) onBuild()
  }

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet"
        onKeyDown={onKeyDown}
      >
        <form onSubmit={submit} className="flex flex-col gap-4 px-5 pt-3 pb-6 md:px-7 md:pt-6 md:pb-7">
          <i className="grip md:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-2xl leading-tight font-extrabold tracking-tight">
              {clarifying ? 'A few details first' : `New plan for ${childName}`}
            </h2>
            <button type="button" className="ib -mr-2" aria-label="Close" onClick={onClose}>
              <X size={22} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>

          {clarifying ? (
            <div key="clarify" className="a-step flex flex-col gap-4">
              <p className="sub">
                “{draft.goal.trim()}” could go a few ways. A short answer to each is enough.
              </p>
              {draft.questions.map((question, at) => (
                <label key={question} className="flex flex-col gap-2">
                  <span className="text-base font-bold">{question}</span>
                  <input
                    type="text"
                    className="in"
                    autoComplete="off"
                    value={draft.answers[at] ?? ''}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        answers: draft.questions.map((_, index) =>
                          index === at ? event.target.value : (draft.answers[index] ?? ''),
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          ) : (
            <div key="goal" className="flex flex-col gap-4">
              <div role="radiogroup" aria-label="Subject" className="flex flex-wrap gap-2">
                {SUBJECT_KEYS.map((key) => {
                  const on = draft.subject === key
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`chip ${SUBJECTS[key].className}`}
                      style={
                        on
                          ? { background: 'var(--s)', color: '#fff' }
                          : { background: 'var(--surface-2)', color: 'var(--text)' }
                      }
                      onClick={() => onChange({ ...draft, subject: key })}
                    >
                      {SUBJECTS[key].label}
                    </button>
                  )
                })}
              </div>

              <textarea
                className="in"
                aria-label="Goal"
                placeholder="Say it like you’d tell a tutor: a grade, a topic, a test coming up."
                style={{ minHeight: 110 }}
                maxLength={GOAL_MAX}
                value={draft.goal}
                onChange={(event) => onChange({ ...draft, goal: event.target.value })}
              />

              <div>
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-2 rounded-lg text-[15px] font-bold"
                  aria-expanded={bookOpen}
                  onClick={() => setBookOpen(!bookOpen)}
                >
                  <BookOpen size={18} strokeWidth={2.2} aria-hidden="true" />
                  Teach from a textbook
                  <span className="sm" style={{ fontWeight: 500 }}>
                    · optional
                  </span>
                  <ChevronDown
                    size={18}
                    strokeWidth={2.4}
                    aria-hidden="true"
                    style={{ transition: 'transform 220ms var(--ease)', transform: bookOpen ? 'rotate(180deg)' : undefined }}
                  />
                </button>
                <div className="fold" data-open={bookOpen}>
                  <div inert={!bookOpen}>
                    {bookOpen && (
                      <Books bookId={draft.bookId} onPick={(bookId) => onChange({ ...draft, bookId })} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm font-bold text-danger">
              <AlertCircle size={18} className="mt-px flex-none" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <Button type="submit" block disabled={!canBuild}>
              Build the plan
            </Button>
            {clarifying && (
              <Button variant="ghost" block onClick={() => onChange({ ...draft, questions: [], answers: [] })}>
                Edit the goal
              </Button>
            )}
          </div>
        </form>
      </div>
    </>
  )
}
