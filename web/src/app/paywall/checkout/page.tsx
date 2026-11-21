import { Suspense } from 'react'
import { Stage } from '@/components/Stage'
import { CheckoutPage } from '@/features/paywall/CheckoutPage'

export default function Page() {
  return (
    <Stage path="/paywall">
      <Suspense fallback={null}>
        <CheckoutPage />
      </Suspense>
    </Stage>
  )
}
