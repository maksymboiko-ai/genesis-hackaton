import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'border border-border bg-surface text-text hover:bg-bg',
  ghost: 'text-muted hover:text-text',
}

export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}
