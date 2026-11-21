'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/Button'
import type { Curriculum } from '@/contracts/domain'
import { ApiRequestError, api } from '@/lib/api'

// "Keep going" on a finished plan: asks for the next lessons, which are
// planned from the plan so far and how it went. Takes several seconds.
export function KeepGoing({
  curriculumId,
  onExtended,
}: {
  curriculumId: string
  onExtended: (curriculum: Curriculum) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function extend() {
    setBusy(true)
    setError('')
    try {
      onExtended(await api.extendCurriculum(curriculumId))
    } catch (cause) {
      // A conflict says why in words meant for the reader (plan being updated, plan full).
      setError(
        cause instanceof ApiRequestError && cause.code === 'conflict'
          ? cause.message
          : 'More lessons could not be planned just now. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="md" block busy={busy} onClick={extend}>
        {!busy && <Plus size={19} strokeWidth={2.6} aria-hidden="true" />}
        {busy ? 'Planning what comes next…' : 'Keep going'}
      </Button>
      <p className="sm" role={error ? 'alert' : undefined} aria-live="polite">
        {error || (busy ? 'Looking at what you learned to choose the next lessons.' : 'Adds new lessons that build on these.')}
      </p>
    </>
  )
}
