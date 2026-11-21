import { Suspense } from 'react'
import { Stage } from '@/components/Stage'
import { SuccessPage } from '@/features/paywall/SuccessPage'

export default function Page() {
  return (
    <Stage path="/paywall">
      <Suspense fallback={null}>
        <SuccessPage />
      </Suspense>
    </Stage>
  )
}
