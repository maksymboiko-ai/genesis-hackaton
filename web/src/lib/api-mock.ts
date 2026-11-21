import {
  CHOICES_PER_QUESTION,
  EXCELLING_FROM,
  MASTERY_ALPHA,
  MASTERY_START,
  REPLAN_WINDOW,
  STRUGGLING_BELOW,
} from '@/contracts/domain'
import type {
  Book,
  Child,
  Curriculum,
  LessonContent,
  LessonKind,
  LessonSummary,
  QuestionResult,
  ReplanEvent,
  ReplanTrigger,
  SkillMastery,
} from '@/contracts/domain'
import {
  CreateChildRequest,
  CreateCurriculumRequest,
  SubmitAttemptRequest,
} from '@/contracts/api'
import type { ApiError } from '@/contracts/api'

type StoredChild = Child & { notes: string }
type StoredBook = Book & { readyAt: number }
type StoredLesson = LessonSummary & { content: LessonContent | null; readyAt: number | null }
type StoredCurriculum = Omit<Curriculum, 'lessons' | 'replanEvents'> & {
  lastReplanAt: number
  replanReadyAt: number | null
  pendingTrigger: ReplanTrigger | null
}
type StoredAttempt = {
  id: string
  lessonId: string
  curriculumId: string
  score: number
  results: QuestionResult[]
  at: number
}

type Db = {
  children: StoredChild[]
  books: StoredBook[]
  curricula: StoredCurriculum[]
  lessons: StoredLesson[]
  attempts: StoredAttempt[]
  events: ReplanEvent[]
  mastery: (SkillMastery & { childId: string })[]
}

const STORAGE_KEY = 'mock-api'
const NETWORK_MS = 250
const OUTLINE_MS = 1500
const LESSON_MS = 2000
const BOOK_MS = 3000
const REPLAN_MS = 3000

const OUTLINE_STEPS = [
  { title: 'Foundations', objective: 'Recall the basics this topic builds on.', skill: 'foundations' },
  { title: 'Core ideas', objective: 'Understand the main ideas step by step.', skill: 'core-ideas' },
  { title: 'Guided practice', objective: 'Solve typical problems with hints.', skill: 'guided-practice' },
  { title: 'Putting it together', objective: 'Apply everything without help.', skill: 'independent-work' },
]

class MockError extends Error {
  status: number
  code: ApiError['error']['code']

  constructor(status: number, code: ApiError['error']['code'], message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const id = () => crypto.randomUUID()
const label = (slug: string) => slug.replaceAll('-', ' ')

function load(): Db {
  const empty: Db = {
    children: [],
    books: [],
    curricula: [],
    lessons: [],
    attempts: [],
    events: [],
    mastery: [],
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...empty, ...JSON.parse(raw) } : empty
  } catch {
    return empty
  }
}

function save(db: Db) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {}
}

function find<T extends { id: string }>(items: T[], itemId: string, name: string): T {
  const item = items.find((candidate) => candidate.id === itemId)
  if (!item) throw new MockError(404, 'not_found', `${name} not found.`)
  return item
}

function lessonsOf(db: Db, curriculumId: string) {
  return db.lessons
    .filter((lesson) => lesson.curriculumId === curriculumId)
    .sort((a, b) => a.position - b.position)
}

function newLesson(
  curriculumId: string,
  position: number,
  kind: LessonKind,
  outline: { title: string; objective: string; skills: string[] },
  retryOfLessonId: string | null = null,
): StoredLesson {
  return {
    id: id(),
    curriculumId,
    position,
    kind,
    title: outline.title,
    objective: outline.objective,
    skills: outline.skills,
    retryOfLessonId,
    contentStatus: 'pending',
    completedAt: null,
    lastScore: null,
    content: null,
    readyAt: null,
  }
}

function buildContent(lesson: StoredLesson): LessonContent {
  const skills = lesson.skills.length ? lesson.skills : ['general']
  const questions = [0, 1, 2].map((index) => {
    const skill = skills[index % skills.length]
    const correctIndex = (index + lesson.position) % CHOICES_PER_QUESTION
    const wrong = ['A common mistake', 'A partly right answer', 'An unrelated answer']
    const choices = Array.from({ length: CHOICES_PER_QUESTION }, (_, choice) =>
      choice === correctIndex ? 'The correct answer' : wrong.pop()!,
    )
    return {
      id: id(),
      prompt: `Question ${index + 1}: which answer shows ${label(skill)}?`,
      choices,
      correctIndex,
      explanation: `This one is correct because it applies ${label(skill)} the way the lesson explains.`,
      skill,
    }
  })

  return {
    bodyMarkdown: [
      `## ${lesson.title}`,
      lesson.objective,
      '### Key idea',
      `This is sample lesson text from the mock API. The real lesson explains **${label(skills[0])}** with examples at the learner's level.`,
      '### Example',
      '1. Read the problem carefully.\n2. Pick the rule that fits.\n3. Check the answer.',
    ].join('\n\n'),
    questions,
  }
}

function applyReplan(db: Db, curriculum: StoredCurriculum, now: number) {
  const trigger = curriculum.pendingTrigger
  const lessons = lessonsOf(db, curriculum.id)
  const window = db.attempts
    .filter((attempt) => attempt.curriculumId === curriculum.id && attempt.at > curriculum.lastReplanAt)
    .slice(-REPLAN_WINDOW)
  const inserted: StoredLesson[] = []
  let diagnosis: ReplanEvent['diagnosis']

  if (trigger === 'struggling') {
    const wrong = window.flatMap((attempt) => attempt.results.filter((result) => !result.correct))
    const missingSkills = [...new Set(wrong.map((result) => result.skill))].slice(0, 2)
    const failed = [...new Set(window.filter((a) => a.score < STRUGGLING_BELOW).map((a) => a.lessonId))]
      .map((lessonId) => lessons.find((lesson) => lesson.id === lessonId))
      .filter((lesson) => lesson !== undefined)

    const current = lessons.find((lesson) => !lesson.completedAt)
    const start = current ? current.position + 1 : lessons.length

    missingSkills.forEach((skill) =>
      inserted.push(
        newLesson(curriculum.id, start + inserted.length, 'remedial', {
          title: `Review: ${label(skill)}`,
          objective: `Rebuild ${label(skill)} from the ground up.`,
          skills: [skill],
        }),
      ),
    )
    failed.forEach((lesson) =>
      inserted.push(newLesson(curriculum.id, start + inserted.length, 'retry', lesson, lesson.id)),
    )
    lessons
      .filter((lesson) => lesson.position >= start)
      .forEach((lesson) => (lesson.position += inserted.length))

    diagnosis = {
      summary: 'The last lessons were too hard, so review lessons come first.',
      mistakes: missingSkills.map((skill) => `Several wrong answers on ${label(skill)}.`),
      missingSkills,
    }
  } else {
    inserted.push(
      newLesson(curriculum.id, lessons.length, 'extension', {
        title: 'Challenge: going further',
        objective: 'Harder problems for a learner who is ahead of the plan.',
        skills: ['advanced-problems'],
      }),
    )
    diagnosis = {
      summary: 'The last lessons went very well, so a harder lesson was added.',
      mistakes: [],
      missingSkills: [],
    }
  }

  db.lessons.push(...inserted)
  db.events.push({
    id: id(),
    curriculumId: curriculum.id,
    trigger: trigger ?? 'excelling',
    diagnosis,
    insertedLessonIds: inserted.map((lesson) => lesson.id),
    createdAt: new Date(now).toISOString(),
  })
  curriculum.replanStatus = 'idle'
  curriculum.replanReadyAt = null
  curriculum.pendingTrigger = null
  curriculum.lastReplanAt = now
}

function settle(db: Db) {
  const now = Date.now()
  db.books.forEach((book) => {
    if (book.status === 'processing' && now >= book.readyAt) book.status = 'ready'
  })
  db.lessons.forEach((lesson) => {
    if (lesson.contentStatus === 'generating' && lesson.readyAt && now >= lesson.readyAt) {
      lesson.content = buildContent(lesson)
      lesson.contentStatus = 'ready'
    }
  })
  db.curricula.forEach((curriculum) => {
    if (curriculum.replanReadyAt && now >= curriculum.replanReadyAt) applyReplan(db, curriculum, now)
  })
}

function omit<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...value }
  keys.forEach((key) => delete copy[key])
  return copy
}

function summary(lesson: StoredLesson): LessonSummary {
  return omit(lesson, 'content', 'readyAt')
}

function publicCurriculum(db: Db, curriculum: StoredCurriculum): Curriculum {
  return {
    ...listItem(curriculum),
    lessons: lessonsOf(db, curriculum.id).map(summary),
    replanEvents: db.events.filter((event) => event.curriculumId === curriculum.id),
  }
}

function listItem(curriculum: StoredCurriculum) {
  return omit(curriculum, 'lastReplanAt', 'replanReadyAt', 'pendingTrigger')
}

function parseBody<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }, raw: unknown): T {
  const parsed = schema.safeParse(typeof raw === 'string' ? JSON.parse(raw) : raw)
  if (!parsed.success) throw new MockError(400, 'bad_request', 'The request is not valid.')
  return parsed.data as T
}

async function createCurriculum(db: Db, raw: unknown) {
  const body = parseBody<CreateCurriculumRequest>(CreateCurriculumRequest, raw)
  find(db.children, body.childId, 'Child')
  await delay(OUTLINE_MS)

  const topic = body.prompt.trim().replace(/\s+/g, ' ')
  const curriculum: StoredCurriculum = {
    id: id(),
    childId: body.childId,
    bookId: body.bookId,
    prompt: body.prompt,
    subject: 'General',
    title: topic.length > 60 ? `${topic.slice(0, 57)}…` : topic,
    replanStatus: 'idle',
    lastReplanAt: 0,
    replanReadyAt: null,
    pendingTrigger: null,
  }
  db.curricula.push(curriculum)
  OUTLINE_STEPS.forEach((step, position) =>
    db.lessons.push(
      newLesson(curriculum.id, position, 'core', {
        title: step.title,
        objective: step.objective,
        skills: [step.skill],
      }),
    ),
  )
  const first = lessonsOf(db, curriculum.id)[0]
  first.contentStatus = 'generating'
  first.readyAt = Date.now() + LESSON_MS
  return { status: 'created' as const, curriculum: publicCurriculum(db, curriculum) }
}

function getLesson(db: Db, lessonId: string) {
  const lesson = find(db.lessons, lessonId, 'Lesson')
  if (lesson.contentStatus === 'pending') {
    lesson.contentStatus = 'generating'
    lesson.readyAt = Date.now() + LESSON_MS
  }
  return {
    ...summary(lesson),
    content: lesson.content && {
      bodyMarkdown: lesson.content.bodyMarkdown,
      questions: lesson.content.questions.map(({ id, prompt, choices, skill }) => ({
        id,
        prompt,
        choices,
        skill,
      })),
    },
  }
}

function submitAttempt(db: Db, lessonId: string, raw: unknown) {
  const body = parseBody<SubmitAttemptRequest>(SubmitAttemptRequest, raw)
  const lesson = find(db.lessons, lessonId, 'Lesson')
  const curriculum = find(db.curricula, lesson.curriculumId, 'Curriculum')
  if (!lesson.content) throw new MockError(409, 'conflict', 'The lesson is not ready yet.')

  const results: QuestionResult[] = lesson.content.questions.map((question) => {
    const answer = body.answers.find((candidate) => candidate.questionId === question.id)
    if (!answer) throw new MockError(400, 'bad_request', 'Every question must be answered.')
    return {
      questionId: question.id,
      skill: question.skill,
      chosenIndex: answer.chosenIndex,
      correctIndex: question.correctIndex,
      correct: answer.chosenIndex === question.correctIndex,
      explanation: question.explanation,
    }
  })
  const score = results.filter((result) => result.correct).length / results.length
  const now = Date.now()
  const attempt: StoredAttempt = { id: id(), lessonId, curriculumId: curriculum.id, score, results, at: now }
  db.attempts.push(attempt)
  lesson.completedAt = new Date(now).toISOString()
  lesson.lastScore = score

  for (const skill of new Set(results.map((result) => result.skill))) {
    const forSkill = results.filter((result) => result.skill === skill)
    const skillScore = forSkill.filter((result) => result.correct).length / forSkill.length
    let row = db.mastery.find(
      (m) => m.childId === curriculum.childId && m.subject === curriculum.subject && m.skill === skill,
    )
    if (!row) {
      row = { childId: curriculum.childId, subject: curriculum.subject, skill, mastery: MASTERY_START }
      db.mastery.push(row)
    }
    row.mastery = (1 - MASTERY_ALPHA) * row.mastery + MASTERY_ALPHA * skillScore
  }

  let replanTriggered: ReplanTrigger | null = null
  const window = db.attempts
    .filter((a) => a.curriculumId === curriculum.id && a.at > curriculum.lastReplanAt)
    .slice(-REPLAN_WINDOW)
  if (curriculum.replanStatus === 'idle' && window.length === REPLAN_WINDOW) {
    const average = window.reduce((sum, a) => sum + a.score, 0) / window.length
    if (average < STRUGGLING_BELOW) replanTriggered = 'struggling'
    else if (average >= EXCELLING_FROM) replanTriggered = 'excelling'
  }
  if (replanTriggered) {
    curriculum.replanStatus = 'running'
    curriculum.pendingTrigger = replanTriggered
    curriculum.replanReadyAt = now + REPLAN_MS
  }

  const next = lessonsOf(db, curriculum.id).find((candidate) => !candidate.completedAt)
  return { attemptId: attempt.id, score, results, replanTriggered, nextLessonId: next?.id ?? null }
}

async function route(db: Db, method: string, parts: string[], query: URLSearchParams, body: unknown) {
  const [resource, itemId, action] = parts
  const key = `${method} ${resource}${itemId ? '/:id' : ''}${action ? `/${action}` : ''}`

  switch (key) {
    case 'GET children':
      return { children: db.children.map((child) => omit(child, 'notes')) }
    case 'POST children': {
      const child = { id: id(), notes: '', ...parseBody<CreateChildRequest>(CreateChildRequest, body) }
      db.children.push(child)
      return omit(child, 'notes')
    }
    case 'GET children/:id/profile': {
      const child = find(db.children, itemId, 'Child')
      return {
        gradeLevel: child.gradeLevel,
        notes: child.notes,
        mastery: db.mastery
          .filter((row) => row.childId === child.id)
          .map((row) => omit(row, 'childId')),
      }
    }
    case 'GET books':
      return { books: db.books.map((book) => omit(book, 'readyAt')) }
    case 'POST books': {
      const title = body instanceof FormData ? String(body.get('title') ?? '').trim() : ''
      if (!title) throw new MockError(400, 'bad_request', 'A textbook needs a title.')
      const book: StoredBook = { id: id(), title, status: 'processing', readyAt: Date.now() + BOOK_MS }
      db.books.push(book)
      return omit(book, 'readyAt')
    }
    case 'GET books/:id':
      return omit(find(db.books, itemId, 'Book'), 'readyAt')
    case 'GET curricula':
      return {
        curricula: db.curricula
          .filter((curriculum) => curriculum.childId === query.get('childId'))
          .map(listItem),
      }
    case 'POST curricula':
      return createCurriculum(db, body)
    case 'GET curricula/:id':
      return publicCurriculum(db, find(db.curricula, itemId, 'Curriculum'))
    case 'GET lessons/:id':
      return getLesson(db, itemId)
    case 'POST lessons/:id/attempts':
      return submitAttempt(db, itemId, body)
    default:
      throw new MockError(404, 'not_found', 'No such endpoint.')
  }
}

export async function mockFetch(path: string, init?: RequestInit): Promise<Response> {
  await delay(NETWORK_MS)
  const url = new URL(path, 'http://mock.local')
  const db = load()
  settle(db)

  try {
    const data = await route(
      db,
      init?.method ?? 'GET',
      url.pathname.split('/').filter(Boolean),
      url.searchParams,
      init?.body,
    )
    save(db)
    return Response.json(data)
  } catch (error) {
    if (!(error instanceof MockError)) throw error
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    )
  }
}
