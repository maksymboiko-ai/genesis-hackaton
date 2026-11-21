'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mascot } from '@/components/Mascot'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { daysLabel, streakOf } from '@/lib/streak'
import { StreakDetails } from './StreakDetails'
import { useResource } from '@/lib/useResource'

export function StreakPill() {
  const pathname = usePathname()
  const router = useRouter()
  const { childId } = useSession()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const load = useCallback(() => api.getStreak(childId!).then(({ days }) => ({ days, pathname })), [childId, pathname])
  const { data } = useResource(childId ? load : null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!data) return null
  const streak = streakOf(data.days)

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        className="streak-pill"
        aria-expanded={open}
        aria-label={`Streak: ${daysLabel(streak.count)}. Show details`}
        onClick={() => {
          if (window.matchMedia('(min-width: 768px)').matches) setOpen(!open)
          else router.push('/app/streak')
        }}
      >
        <Mascot pose={streak.pose} size={30} />
        <span>{streak.count}</span>
      </button>

      {open && (
        <div className="pop top-[52px] right-0 flex w-[320px] max-w-[calc(100vw-24px)] flex-col gap-4 p-5" role="dialog" aria-label="Streak details">
          <StreakDetails streak={streak} />
        </div>
      )}
    </div>
  )
}
