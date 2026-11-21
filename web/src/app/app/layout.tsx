import { Stage } from '@/components/Stage'
import { ProductLayout } from '@/features/product/ProductLayout'

export default function Layout({ children }: LayoutProps<'/app'>) {
  return (
    <Stage path="/app">
      <ProductLayout>{children}</ProductLayout>
    </Stage>
  )
}
