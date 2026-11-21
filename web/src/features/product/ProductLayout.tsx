'use client'

import { LogOut } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button } from '@/components/Button'
import { Wordmark } from '@/components/Wordmark'
import { APP_NAME } from '@/lib/config'
import { useSession } from '@/lib/session'
import { StreakPill } from '@/features/streak/StreakPill'
import { ChildMenu } from './ChildMenu'
import './product.css'

export function ProductLayout({ children }: { children: ReactNode }) {
  const { signOut } = useSession()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 bg-surface/90 backdrop-blur md:border-b md:border-border">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-3 pr-3 pl-5 md:h-[72px] md:px-10">
          <Link href="/app" aria-label={`${APP_NAME}, home`} className="rounded-lg">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2 md:gap-3">
            <StreakPill />
            <ChildMenu />
            <div className="hidden md:block">
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut size={18} strokeWidth={2.2} aria-hidden="true" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-5 pt-2 pb-8 md:px-10 md:py-9">{children}</main>
    </div>
  )
}
