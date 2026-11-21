'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { clearSession, useSession } from '@/lib/session'

// The local session is only a hint; the server session (httpOnly cookie) is
// the truth. Checked once per page load.
let checked: Promise<void> | null = null
function confirmServerSession() {
  checked ??= api.me().then(
    () => undefined,
    (error) => {
      if (error instanceof ApiRequestError && error.code === 'unauthorized') clearSession()
    },
  )
  return checked
}

export type StagePath = '/signup' | '/login' | '/quiz' | '/paywall' | '/app'

export function Stage({ path, children }: { path?: StagePath; children?: ReactNode }) {
  const router = useRouter()
  const { ready, user, childId } = useSession()

  const home: StagePath = !user ? '/signup' : !childId ? '/quiz' : '/app'
  const allowed =
    ready &&
    (path === '/quiz' || path === '/paywall' ? user !== null : path === '/login' ? user === null : home === path)

  useEffect(() => {
    if (ready && !allowed) router.replace(home)
  }, [ready, allowed, home, router])

  useEffect(() => {
    if (ready && user) void confirmServerSession()
  }, [ready, user])

  return allowed ? children : null
}
