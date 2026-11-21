'use client'

import { CircleAlert } from 'lucide-react'
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

  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        placeholder={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? noteId : undefined}
        className={`in ${error ? 'err' : ''}`}
        {...rest}
      />
      {error ? (
        <p id={noteId} className="a-fade mt-2 flex items-start gap-1.5 text-sm font-bold text-danger">
          <CircleAlert size={18} strokeWidth={2.2} aria-hidden="true" className="mt-px flex-none" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={noteId} className="sm mt-2">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
