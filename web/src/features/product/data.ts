import type { Curriculum, LessonSummary, ReplanEvent } from '@/contracts/domain'
import { api } from '@/lib/api'

export async function loadPlans(childId: string): Promise<Curriculum[]> {
  const { curricula } = await api.listCurricula(childId)
  const plans = await Promise.all(curricula.map((curriculum) => api.getCurriculum(curriculum.id)))
  return plans.map((plan) => ({ ...plan, lessons: [...plan.lessons].sort((a, b) => a.position - b.position) }))
}

export const isAdjusting = (plans: Curriculum[]) => plans.some((plan) => plan.replanStatus === 'running')

export const nextLesson = (plan: Curriculum): LessonSummary | null =>
  plan.lessons.find((lesson) => !lesson.completedAt) ?? null

export const doneLessons = (plan: Curriculum) => plan.lessons.filter((lesson) => lesson.completedAt)

export const lessonNumber = (plan: Curriculum, lesson: LessonSummary) => plan.lessons.indexOf(lesson) + 1

const lastActivity = (plan: Curriculum) =>
  Math.max(0, ...doneLessons(plan).map((lesson) => Date.parse(lesson.completedAt!)))

export function pickUpNext(plans: Curriculum[]): Curriculum | null {
  const open = plans.filter((plan) => nextLesson(plan))
  if (open.length === 0) return null
  return open.reduce((best, plan) => (lastActivity(plan) > lastActivity(best) ? plan : best))
}

export function averageScore(plans: Curriculum[]): number | null {
  const scores = plans.flatMap((plan) => plan.lessons.map((lesson) => lesson.lastScore)).filter((score) => score !== null)
  if (scores.length === 0) return null
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

const DAY = 24 * 60 * 60 * 1000

export function lessonsThisWeek(plans: Curriculum[]) {
  const since = Date.now() - 7 * DAY
  return plans.flatMap(doneLessons).filter((lesson) => Date.parse(lesson.completedAt!) >= since).length
}

export function dayLabel(iso: string) {
  const date = new Date(iso)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const days = Math.floor((startOfToday.getTime() - new Date(date).setHours(0, 0, 0, 0)) / DAY)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'long' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function skillLabel(slug: string) {
  const text = slug.replaceAll('-', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const count = (amount: number, one: string, many: string) => (amount === 1 ? one : `${amount} ${many}`)

export type PlanChange = {
  id: string
  plan: Curriculum
  event: ReplanEvent
  good: boolean
  title: string
  detail: string
}

export function describeChange(plan: Curriculum, event: ReplanEvent): PlanChange {
  const inserted = plan.lessons.filter((lesson) => event.insertedLessonIds.includes(lesson.id))
  const of = (kind: LessonSummary['kind']) => inserted.filter((lesson) => lesson.kind === kind).length
  const good = event.trigger === 'excelling'
  const parts = [
    of('remedial') > 0 && count(of('remedial'), 'a review', 'reviews'),
    of('retry') > 0 && count(of('retry'), 'a retry', 'retries'),
    of('extension') > 0 && count(of('extension'), 'a challenge', 'challenges'),
  ].filter((part): part is string => Boolean(part))

  const title =
    parts.length === 0
      ? good
        ? 'Added a challenge'
        : 'Added review lessons'
      : `Added ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}`

  const skills = event.diagnosis.missingSkills.map((skill) => skillLabel(skill).toLowerCase()).join(', ')
  return { id: event.id, plan, event, good, title, detail: skills || event.diagnosis.summary }
}

export function planChanges(plans: Curriculum[]): PlanChange[] {
  return plans
    .flatMap((plan) => plan.replanEvents.map((event) => describeChange(plan, event)))
    .sort((a, b) => Date.parse(b.event.createdAt) - Date.parse(a.event.createdAt))
}

export const AVATARS = [
  { background: 'var(--sun-tint)', color: 'var(--sun-ink)' },
  { background: 'var(--sci-tint)', color: 'var(--sci-ink)' },
  { background: 'var(--math-tint)', color: 'var(--math-ink)' },
  { background: 'var(--read-tint)', color: 'var(--read-ink)' },
  { background: 'var(--challenge-tint)', color: 'var(--challenge-ink)' },
]
