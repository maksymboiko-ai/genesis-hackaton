'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/Button'
import { APP_NAME } from '@/lib/config'
import { useSession } from '@/lib/session'

export function ProductLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useSession()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <span className="font-semibold">{APP_NAME}</span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-muted">{user?.name}</span>
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  )
}
