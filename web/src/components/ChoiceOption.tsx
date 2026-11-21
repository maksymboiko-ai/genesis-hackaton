import type { ReactNode } from 'react'

type Props = {
  name: string
  value: string
  checked: boolean
  onChange: () => void
  type?: 'radio' | 'checkbox'
  disabled?: boolean
  compact?: boolean
  children: ReactNode
}

export function ChoiceOption({ name, value, checked, onChange, type = 'radio', disabled, compact, children }: Props) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface py-3 transition has-checked:border-accent has-checked:ring-1 has-checked:ring-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent has-disabled:cursor-default ${compact ? 'justify-center px-2' : 'px-4'}`}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className={compact ? 'sr-only' : 'size-4 shrink-0 accent-(--accent)'}
      />
      <span>{children}</span>
    </label>
  )
}
