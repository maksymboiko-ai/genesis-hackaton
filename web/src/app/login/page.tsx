import { Stage } from '@/components/Stage'
import { LoginPage } from '@/features/auth/LoginPage'

export default function Page() {
  return (
    <Stage path="/login">
      <LoginPage />
    </Stage>
  )
}
