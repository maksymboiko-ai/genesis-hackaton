'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useSession } from '@/lib/session'

export type StagePath = '/signup' | '/quiz' | '/app'

export function Stage({ path, children }: { path?: StagePath; children?: ReactNode }) {
  const router = useRouter()
  const { ready, user, quiz } = useSession()

  const home: StagePath = !user ? '/signup' : !quiz ? '/quiz' : '/app'
  const allowed = ready && home === path

  useEffect(() => {
    if (ready && !allowed) router.replace(home)
  }, [ready, allowed, home, router])

  return allowed ? children : null
}
