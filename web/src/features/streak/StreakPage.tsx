'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useCallback } from 'react'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { streakOf } from '@/lib/streak'
import { useResource } from '@/lib/useResource'
import { StreakDetails } from './StreakDetails'

export function StreakPage() {
  const { childId } = useSession()
  const load = useCallback(() => api.getStreak(childId!), [childId])
  const { data } = useResource(childId ? load : null)

  return (
    <div className="a-rise mx-auto flex w-full max-w-[460px] flex-col gap-5">
      <Link href="/app" className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-lg px-2 text-[16px] font-semibold">
        <ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" />
        Home
      </Link>
      {data ? (
        <StreakDetails streak={streakOf(data.days)} />
      ) : (
        <>
          <span className="sk h-20 w-2/3" />
          <span className="sk h-16 w-full rounded-[20px]" />
          <span className="sk h-20 w-full rounded-[16px]" />
        </>
      )}
    </div>
  )
}
