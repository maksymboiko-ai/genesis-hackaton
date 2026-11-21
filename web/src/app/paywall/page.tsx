import { Suspense } from 'react'
import { Stage } from '@/components/Stage'
import { PaywallPage } from '@/features/paywall/PaywallPage'

export default function Page() {
  return (
    <Stage path="/paywall">
      <Suspense fallback={null}>
        <PaywallPage />
      </Suspense>
    </Stage>
  )
}
