'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/Button'
import { StatusNote } from '@/components/StatusNote'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { useResource } from '@/lib/useResource'

export function HomePage() {
  const router = useRouter()
  const { childId, setChildId } = useSession()
  const [prompt, setPrompt] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const children = useResource(api.listChildren)
  const loadCurricula = useCallback(() => api.listCurricula(childId!), [childId])
  const curricula = useResource(childId ? loadCurricula : null)

  const child = children.data?.children.find((candidate) => candidate.id === childId)
  const childMissing = children.data !== null && !child

  useEffect(() => {
    if (childMissing) setChildId(null)
  }, [childMissing, setChildId])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!childId || !prompt.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      const result = await api.createCurriculum({
        childId,
        prompt: prompt.trim(),
        bookId: null,
        clarifications: [],
      })
      if (result.status === 'needs_clarification') {
        // Placeholder until the questions get their own step: ask for the
        // missing detail in the goal itself.
        setCreateError(`Add a little more detail to the goal: ${result.questions.join(' ')}`)
        setCreating(false)
        return
      }
      router.push(`/app/curricula/${result.curriculum.id}`)
    } catch {
      setCreateError('Could not build the plan. Try again.')
      setCreating(false)
    }
  }

  if (children.error) return <StatusNote tone="error">{children.error}</StatusNote>
  if (!child) return <StatusNote>Loading…</StatusNote>

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{child.name}&apos;s learning plans</h1>
        <Link href="/app/children/new" className="text-sm text-muted underline underline-offset-4 hover:text-text">
          Add another learner
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-border bg-surface p-5">
        <label htmlFor="goal" className="block font-medium">
          What should {child.name} learn?
        </label>
        <textarea
          id="goal"
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="My child got a B in algebra and struggles with equations"
          className="mt-3 block w-full rounded-lg border border-border bg-bg p-3 text-base outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        {createError && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {createError}
          </p>
        )}
        <Button type="submit" disabled={creating || !prompt.trim()} className="mt-4">
          {creating ? 'Building the plan…' : 'Build a plan'}
        </Button>
      </form>

      <section className="mt-8">
        <h2 className="font-medium">Plans</h2>
        {curricula.error && <StatusNote tone="error">{curricula.error}</StatusNote>}
        {curricula.data?.curricula.length === 0 && (
          <p className="mt-3 text-muted">No plans yet. Describe a goal above to build the first one.</p>
        )}
        <ul className="mt-3 space-y-3">
          {curricula.data?.curricula.map((curriculum) => (
            <li key={curriculum.id}>
              <Link
                href={`/app/curricula/${curriculum.id}`}
                className="block rounded-xl border border-border bg-surface p-4 hover:border-accent"
              >
                <span className="block font-medium">{curriculum.title}</span>
                <span className="mt-1 block text-sm text-muted">{curriculum.subject}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
