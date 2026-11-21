import { APP_NAME } from '@/lib/config'

export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`wm ${className}`}>{APP_NAME}</span>
}
