import { Suspense } from 'react'
import { Stage } from '@/components/Stage'
import { ProductLayout } from '@/features/product/ProductLayout'

export default function Layout({ children }: LayoutProps<'/app'>) {
  return (
    <Stage path="/app">
      <ProductLayout>
        <Suspense fallback={null}>{children}</Suspense>
      </ProductLayout>
    </Stage>
  )
}
