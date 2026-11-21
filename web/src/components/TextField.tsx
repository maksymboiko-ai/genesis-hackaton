'use client'

import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  hint?: string
}

export function TextField({ label, error, hint, className = '', ...rest }: Props) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error ?? hint

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={`block min-h-11 w-full rounded-lg border bg-surface px-3 text-base outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${error ? 'border-danger' : 'border-border'}`}
        {...rest}
      />
      {note && (
        <p id={noteId} className={`mt-1.5 text-sm ${error ? 'text-danger' : 'text-muted'}`}>
          {note}
        </p>
      )}
    </div>
  )
}
