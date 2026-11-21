'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button } from '@/components/Button'
import { APP_NAME } from '@/lib/config'
import { useSession } from '@/lib/session'

export function ProductLayout({ children }: { children: ReactNode }) {
  const { signOut } = useSession()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/app" className="font-semibold">
            {APP_NAME}
          </Link>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  )
}
