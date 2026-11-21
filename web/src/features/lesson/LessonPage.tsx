'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback } from 'react'
import Markdown from 'react-markdown'
import { StatusNote } from '@/components/StatusNote'
import type { GetLessonResponse } from '@/contracts/api'
import { api } from '@/lib/api'
import { useResource } from '@/lib/useResource'

const isPreparing = (lesson: GetLessonResponse) =>
  lesson.contentStatus === 'pending' || lesson.contentStatus === 'generating'

export function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const load = useCallback(() => api.getLesson(lessonId), [lessonId])
  const { data: lesson, error } = useResource(load, isPreparing)

  if (error) return <StatusNote tone="error">{error}</StatusNote>
  if (!lesson) return <StatusNote>Loading…</StatusNote>

  return (
    <>
      <Link
        href={`/app/curricula/${lesson.curriculumId}`}
        className="text-sm text-muted underline underline-offset-4 hover:text-text"
      >
        Back to the plan
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{lesson.title}</h1>
      <p className="mt-2 text-muted">{lesson.objective}</p>

      <div className="mt-6">
        {isPreparing(lesson) && <StatusNote>Preparing the lesson…</StatusNote>}
        {lesson.contentStatus === 'failed' && (
          <StatusNote tone="error">The lesson could not be prepared. Reload the page to try again.</StatusNote>
        )}
        {lesson.content && (
          <div className="lesson-body">
            <Markdown>{lesson.content.bodyMarkdown}</Markdown>
          </div>
        )}
      </div>
    </>
  )
}
