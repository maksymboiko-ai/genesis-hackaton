import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'subject' | 'onSubject'
type Size = 'lg' | 'md' | 'sm'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  block?: boolean
  busy?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary: '',
  secondary: 'sec',
  ghost: 'q',
  subject: 'subj',
  onSubject: 'onsubj',
}

const SIZES: Record<Size, string> = { lg: '', md: 'md', sm: 'sm-btn' }

export function Button({
  variant = 'primary',
  size = 'lg',
  block,
  busy,
  className = '',
  type = 'button',
  disabled,
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`btn ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'wide' : ''} ${className}`}
      {...rest}
    >
      {busy && <span className="spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
