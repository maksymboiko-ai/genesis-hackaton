import { CircleAlert, Info } from 'lucide-react'
import type { ReactNode } from 'react'

export function StatusNote({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  const Icon = tone === 'error' ? CircleAlert : Info
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`a-fade flex items-start gap-2.5 rounded-[14px] px-4 py-3.5 text-[15px] leading-snug font-medium ${
        tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-muted'
      }`}
    >
      <Icon size={20} strokeWidth={2} aria-hidden="true" className="mt-px flex-none" />
      <span>{children}</span>
    </p>
  )
}
