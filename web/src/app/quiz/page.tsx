import { Stage } from '@/components/Stage'
import { OnboardingPage } from '@/features/onboarding/OnboardingPage'

export default function Page() {
  return (
    <Stage path="/quiz">
      <OnboardingPage />
    </Stage>
  )
}
