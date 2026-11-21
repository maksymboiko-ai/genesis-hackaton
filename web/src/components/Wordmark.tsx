import { APP_NAME } from '@/lib/config'

const INK = '#1e3a2a'
const SKIN = '#a9c675'
const SHELL = '#3d6e4a'
const PLATE = '#4f8a5c'
const BELLY = '#f2deb9'

/** The walking turtle, side view. Drawn for the logo, not one of the mascot poses. */
export function TurtleMark({ size = 34, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 48) / 64)}
      viewBox="0 0 64 48"
      aria-hidden="true"
      className={`flex-none ${className}`}
    >
      <g stroke={INK} strokeWidth={2.4} strokeLinejoin="round">
        <path d="M7 35 L1 38 L8 39 Z" fill={SKIN} />
        <rect x="14" y="32" width="9" height="12" rx="4.5" fill={SKIN} />
        <rect x="38" y="32" width="9" height="12" rx="4.5" fill={SKIN} />
      </g>
      <path d="M46 30 Q50 22 54 18" stroke={INK} strokeWidth={10} strokeLinecap="round" fill="none" />
      <path d="M46 30 Q50 22 54 18" stroke={SKIN} strokeWidth={5.6} strokeLinecap="round" fill="none" />
      <circle cx="55" cy="17" r="8" fill={SKIN} stroke={INK} strokeWidth={2.4} />
      <circle cx="57.5" cy="15" r="2" fill={INK} />
      <path d="M56 20.5 Q58.5 22 61 20" stroke={INK} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <path d="M6 35 Q6 9 28 9 Q50 9 50 35 Z" fill={SHELL} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <path d="M22 19 L28 15 L34 19 L34 26 L28 30 L22 26 Z" fill={PLATE} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <path d="M22 19 L14 17 M34 19 L42 17 M22 26 L12 30 M34 26 L44 30 M28 30 L28 35 M28 15 L28 9" stroke={INK} strokeWidth={1.6} />
      <rect x="5" y="33" width="46" height="5" rx="2.5" fill={BELLY} stroke={INK} strokeWidth={2.4} />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`wm ${className}`}>
      <TurtleMark />
      {APP_NAME}
    </span>
  )
}
