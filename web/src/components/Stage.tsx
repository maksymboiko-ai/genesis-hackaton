'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useSession } from '@/lib/session'

export type StagePath = '/signup' | '/quiz' | '/paywall' | '/app'

export function Stage({ path, children }: { path?: StagePath; children?: ReactNode }) {
  const router = useRouter()
  const { ready, user, childId } = useSession()

  const home: StagePath = !user ? '/signup' : !childId ? '/quiz' : '/app'
  const allowed = ready && (path === '/quiz' || path === '/paywall' ? user !== null : home === path)

  useEffect(() => {
    if (ready && !allowed) router.replace(home)
  }, [ready, allowed, home, router])

  return allowed ? children : null
}
