'use client'

import { Mascot } from '@/components/Mascot'
import { Check, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { KindTag } from '@/components/KindTag'
import { SubjectTile } from '@/components/SubjectTile'
import type { GetLessonResponse, SubmitAttemptResponse } from '@/contracts/api'
import type { Curriculum, LessonBlock } from '@/contracts/domain'
import { api } from '@/lib/api'
import { SUBJECTS, subjectKey, subjectLabel } from '@/lib/subjects'
import { useResource } from '@/lib/useResource'
import { LessonBody } from './LessonBody'
import { Quiz } from './Quiz'
import { Results } from './Results'
import { extractPassage, splitLabel, splitSections } from './text'
import './lesson.css'

const STAGES = ['Matching your level', 'Building the worked examples', 'Drawing the figures', 'Writing the questions']
const STAGE_MS = 2600

const isPreparing = (lesson: GetLessonResponse) =>
  lesson.contentStatus === 'pending' || lesson.contentStatus === 'generating'
const isReplanning = (curriculum: Curriculum) => curriculum.replanStatus === 'running'

export function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  return <Lesson key={lessonId} lessonId={lessonId} />
}

function Lesson({ lessonId }: { lessonId: string }) {
  const loadLesson = useCallback(() => api.getLesson(lessonId), [lessonId])
  const lessonResource = useResource(loadLesson, isPreparing)
  const lesson = lessonResource.data
  const reloadLesson = lessonResource.reload
  // "Try again" on a failed lesson: the retry endpoint starts generation at
  // once (a plain reload would wait out the server's one-minute cooldown).
  const retryLesson = useCallback(async () => {
    try {
      await api.retryLesson(lessonId)
    } catch {}
    reloadLesson()
  }, [lessonId, reloadLesson])

  const curriculumId = lesson?.curriculumId ?? null
  const loadCurriculum = useCallback(() => api.getCurriculum(curriculumId!), [curriculumId])
  const curriculumResource = useResource(curriculumId ? loadCurriculum : null, isReplanning)
  const curriculum = curriculumResource.data

  const [mode, setMode] = useState<'read' | 'quiz' | 'results'>('read')
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<SubmitAttemptResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const subject = subjectKey(curriculum?.subject ?? (lesson ? `${lesson.title} ${lesson.skills.join(' ')}` : ''))
  const position = curriculum && lesson ? curriculum.lessons.findIndex((item) => item.id === lesson.id) : -1
  const lessonNumber = position >= 0 ? position + 1 : null
  const planHref = curriculumId ? `/app/curricula/${curriculumId}` : '/app'

  const markdown = lesson?.content?.bodyMarkdown ?? ''
  const sections = useMemo(() => splitSections(markdown, lesson?.title ?? ''), [markdown, lesson?.title])
  const passage = useMemo(() => (subject === 'read' ? extractPassage(markdown) : []), [markdown, subject])
  const questions = lesson?.content?.questions ?? []
  const blocks = lesson?.content?.blocks ?? []

  async function submit() {
    if (!lesson) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const response = await api.submitAttempt(lesson.id, {
        answers: questions.map((question) => ({ questionId: question.id, chosenIndex: answers[question.id] })),
      })
      setResult(response)
      setMode('results')
      lessonResource.reload()
      curriculumResource.reload()
    } catch {
      setSubmitError('Your answers could not be sent. They are still here, so try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const startQuiz = () => {
    setAnswers({})
    setResult(null)
    setSubmitError('')
    setMode('quiz')
  }

  if (lessonResource.error) {
    return (
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4">
        <FailNote />
        <div className="flex flex-col gap-2 md:flex-row">
          <Button onClick={lessonResource.reload}>Try again</Button>
          <Link href="/app" className="btn q">
            Back home
          </Link>
        </div>
      </div>
    )
  }

  if (!lesson || (!curriculum && !curriculumResource.error)) return <LoadingShell />

  return (
    <div className={`${SUBJECTS[subject].className}`}>
      {mode === 'quiz' && (
        <Quiz
          questions={questions}
          answers={answers}
          onAnswer={(questionId, choice) => setAnswers((prev) => ({ ...prev, [questionId]: choice }))}
          onExit={() => setMode('read')}
          onSubmit={submit}
          submitting={submitting}
          error={submitError}
          passage={passage}
        />
      )}

      {mode === 'results' && result && (
        <Results
          result={result}
          questions={questions}
          curriculum={curriculum}
          curriculumId={lesson.curriculumId}
          lessonNumber={lessonNumber}
          onRetake={startQuiz}
        />
      )}

      {mode === 'read' && (
        <Reading
          lesson={lesson}
          curriculum={curriculum}
          lessonNumber={lessonNumber}
          planHref={planHref}
          subject={subject}
          sections={sections}
          blocks={blocks}
          onStart={startQuiz}
          onRetry={retryLesson}
        />
      )}
    </div>
  )
}

function LoadingShell() {
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-3 pt-4" aria-busy="true" aria-label="Loading the lesson">
      <span className="sk h-5 w-1/3" />
      <span className="sk h-9 w-4/5" />
      <span className="sk mt-2 h-4" />
      <span className="sk h-4 w-11/12" />
      <span className="sk h-28 rounded-[20px]!" />
    </div>
  )
}

function FailNote() {
  return (
    <div role="alert" className="a-rise flex gap-3 rounded-[18px] bg-danger-soft p-4">
      <Mascot pose="sad" size={72} />
      <p className="m-0 self-center text-base leading-normal font-medium">
        <b>This lesson didn’t finish loading.</b> That’s on us, not you. Nothing you did is lost.
      </p>
    </div>
  )
}

function Preparing() {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setStage((value) => Math.min(value + 1, STAGES.length - 1)), STAGE_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="a-fade flex min-h-[52dvh] flex-col items-center justify-center gap-5 py-6 text-center">
      <Mascot pose="reading" size={176} className="a-pulse" />
      <div className="flex flex-col items-center gap-3.5" role="status" aria-live="polite">
        <h2 className="q" style={{ fontSize: 26 }}>
          Reading up on your lesson…
        </h2>
        <div className="flex flex-col items-start gap-2">
          {STAGES.map((text, index) =>
            index > stage ? null : (
              <span key={text} className={`a-rise flex items-center gap-2.5 text-[16px] ${index === stage ? 'font-bold' : ''}`}>
                {index < stage ? (
                  <Check size={17} strokeWidth={3} className="a-pop text-success" aria-hidden="true" />
                ) : (
                  <span className="spin text-success" style={{ width: 16, height: 16, borderWidth: 2.5 }} aria-hidden="true" />
                )}
                {text}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  )
}

type ReadingProps = {
  lesson: GetLessonResponse
  curriculum: Curriculum | null
  lessonNumber: number | null
  planHref: string
  subject: ReturnType<typeof subjectKey>
  sections: ReturnType<typeof splitSections>
  blocks: LessonBlock[]
  onStart: () => void
  onRetry: () => void
}

function Reading({
  lesson,
  curriculum,
  lessonNumber,
  planHref,
  subject,
  sections,
  blocks,
  onStart,
  onRetry,
}: ReadingProps) {
  const trackRef = useRef<HTMLElement>(null)
  const [active, setActive] = useState<string | null>(null)
  const ready = lesson.content !== null
  const failed = lesson.contentStatus === 'failed'
  const questionCount = lesson.content?.questions.length ?? 0
  // Computed by the backend from the written lesson: reading plus the quiz.
  const minutes = lesson.estimatedMinutes
  const done = lesson.completedAt !== null
  const score = lesson.lastScore !== null && questionCount ? Math.round(lesson.lastScore * questionCount) : null
  const outline = useMemo(() => sections.filter((section) => section.heading), [sections])

  useEffect(() => {
    if (!ready) return
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const ratio = max > 0 ? Math.min(1, window.scrollY / max) : 1
      if (trackRef.current) trackRef.current.style.transform = `scaleX(${ratio})`
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ready])

  useEffect(() => {
    if (!ready || outline.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length) setActive(visible[0].target.id)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    outline.forEach((section) => {
      const element = document.getElementById(section.id)
      if (element) observer.observe(element)
    })
    return () => observer.disconnect()
  }, [ready, outline])

  return (
    <div>
      <div className="lesson-bar">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5">
          <Link href={planHref} className="barbtn -ml-2 justify-self-start">
            <ChevronLeft size={20} strokeWidth={2.2} className="flex-none" aria-hidden="true" />
            <span className="truncate md:hidden">Plan</span>
            <span className="hidden truncate md:inline">{curriculum?.title ?? 'Plan'}</span>
          </Link>
          <span className="sm whitespace-nowrap">
            {lessonNumber && curriculum ? `Lesson ${lessonNumber} of ${curriculum.lessons.length}` : ''}
          </span>
          <span />
        </div>
        <div className="track" aria-hidden="true">
          <i ref={trackRef} style={{ transform: 'scaleX(0)' }} />
        </div>
      </div>

      <div className="pt-6 lg:grid lg:grid-cols-[200px_minmax(0,680px)] lg:justify-center lg:gap-12 lg:pt-10">
        <nav aria-label="In this lesson" className="toc hidden pt-40 lg:block">
          {ready && outline.length > 0 && (
            <div className="sticky top-40 flex flex-col gap-0.5">
              <p className="sm mb-2 font-bold!">In this lesson</p>
              {outline.map((section) => (
                <a key={section.id} href={`#${section.id}`} className={active === section.id ? 'on' : ''}>
                  {splitLabel(section.heading!).title}
                </a>
              ))}
              <a href="#lesson-quiz">{questionCount} questions</a>
            </div>
          )}
        </nav>

        <article className="a-rise min-w-0">
          <header className="mb-2 flex flex-col gap-3 border-b border-border pb-6">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="subj">
                <SubjectTile subject={subject} size={26} />
                {curriculum ? subjectLabel(curriculum.subject) : SUBJECTS[subject].label}
              </span>
              {lesson.kind !== 'core' && <KindTag kind={lesson.kind} />}
              {done && score !== null && (
                <span className="k bg-sci-tint! text-sci-ink!">
                  <Check size={13} strokeWidth={3.2} aria-hidden="true" />
                  Done · {score}/{questionCount}
                </span>
              )}
            </div>
            <h1 className="q text-[30px]! md:text-[40px]!">{lesson.title}</h1>
            <p className="sub">{lesson.objective}</p>
            {ready && (
              <p className="sm">
                About {minutes} minutes, with {questionCount} questions
              </p>
            )}
          </header>

          {failed && (
            <div className="flex flex-col gap-4 pt-4">
              <FailNote />
              <div className="flex flex-col gap-2 md:flex-row">
                <Button onClick={onRetry}>Try again</Button>
                <Link href={planHref} className="btn q">
                  Back to the plan
                </Link>
              </div>
            </div>
          )}

          {!ready && !failed && (
            <div className="pt-4">
              <Preparing />
            </div>
          )}

          {ready && (
            <>
              <div className="a-fade pt-4">
                <LessonBody sections={sections} blocks={blocks} subject={subject} />
              </div>
              <div id="lesson-quiz" className="lesson-foot md:mt-10 md:scroll-mt-40">
                <Button block onClick={onStart}>
                  {done ? 'Take the questions again' : 'I’m ready for the questions'}
                </Button>
              </div>
              <div className="h-28 md:hidden" aria-hidden="true" />
            </>
          )}
        </article>
      </div>
    </div>
  )
}
