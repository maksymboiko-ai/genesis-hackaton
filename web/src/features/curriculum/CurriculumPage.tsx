'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback } from 'react'
import { StatusNote } from '@/components/StatusNote'
import type { Curriculum } from '@/contracts/domain'
import { api } from '@/lib/api'
import { useResource } from '@/lib/useResource'

const isReplanning = (curriculum: Curriculum) => curriculum.replanStatus === 'running'

export function CurriculumPage() {
  const { curriculumId } = useParams<{ curriculumId: string }>()
  const load = useCallback(() => api.getCurriculum(curriculumId), [curriculumId])
  const { data: curriculum, error } = useResource(load, isReplanning)

  if (error) return <StatusNote tone="error">{error}</StatusNote>
  if (!curriculum) return <StatusNote>Loading…</StatusNote>

  return (
    <>
      <p className="text-sm text-muted">{curriculum.subject}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{curriculum.title}</h1>

      {isReplanning(curriculum) && (
        <div className="mt-6">
          <StatusNote>Adjusting the plan…</StatusNote>
        </div>
      )}

      <ol className="mt-6 space-y-3">
        {curriculum.lessons.map((lesson, index) => (
          <li key={lesson.id}>
            <Link
              href={`/app/lessons/${lesson.id}`}
              className="block rounded-xl border border-border bg-surface p-4 hover:border-accent"
            >
              <span className="block font-medium">
                {index + 1}. {lesson.title}
              </span>
              <span className="mt-1 block text-sm text-muted">{lesson.objective}</span>
            </Link>
          </li>
        ))}
      </ol>
    </>
  )
}
