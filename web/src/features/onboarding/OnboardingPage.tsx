'use client'

import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session'
import { ChildQuiz } from './ChildQuiz'

export function OnboardingPage({ cancellable = false }: { cancellable?: boolean }) {
  const router = useRouter()
  const { setChildId } = useSession()

  const quiz = (
    <ChildQuiz
      embedded={cancellable}
      onDone={(child, curriculumId) => {
        setChildId(child.id)
        if (!curriculumId) router.push('/app')
        else router.push(cancellable ? `/app/curricula/${curriculumId}` : `/paywall?plan=${curriculumId}`)
      }}
      onCancel={cancellable ? () => router.push('/app') : undefined}
    />
  )

  return cancellable ? quiz : <main>{quiz}</main>
}
