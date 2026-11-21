import { Stage } from '@/components/Stage'
import { SignUpPage } from '@/features/auth/SignUpPage'

export default function Page() {
  return (
    <Stage path="/signup">
      <SignUpPage />
    </Stage>
  )
}
