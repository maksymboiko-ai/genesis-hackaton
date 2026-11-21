'use client'

import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session'
import { ChildQuiz } from './ChildQuiz'

export function OnboardingPage({ cancellable = false }: { cancellable?: boolean }) {
  const router = useRouter()
  const { setChildId } = useSession()

  return (
    <ChildQuiz
      onDone={(child) => {
        setChildId(child.id)
        router.push('/app')
      }}
      onCancel={cancellable ? () => router.push('/app') : undefined}
    />
  )
}
