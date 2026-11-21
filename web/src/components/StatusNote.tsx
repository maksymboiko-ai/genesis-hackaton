import type { ReactNode } from 'react'

export function StatusNote({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${tone === 'error' ? 'border-danger text-danger' : 'border-border bg-surface text-muted'}`}
    >
      {children}
    </p>
  )
}
