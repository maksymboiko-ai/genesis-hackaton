import {
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
import { MOCK_LESSONS } from './api-mock-lessons'
import { subjectKey } from './subjects'
import type { SubjectKey } from './subjects'

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

const OUTLINES: Record<SubjectKey, { subject: string; title: string; steps: { title: string; objective: string; skill: string }[] }> = {
  math: {
    subject: 'algebra',
    title: 'Two-step equations',
    steps: [
      { title: 'What an equation is saying', objective: 'Read an equation as a balance between two sides.', skill: 'reading-equations' },
      { title: 'Undoing one step at a time', objective: 'Solve one-step equations with inverse operations.', skill: 'inverse-operations' },
      { title: 'Negatives on both sides', objective: 'Keep track of signs when adding and subtracting negatives.', skill: 'negative-numbers' },
      { title: 'Moving terms across the equals sign', objective: 'Move a term to the other side without flipping the wrong sign.', skill: 'moving-terms' },
      { title: 'Two-step equations', objective: 'Solve two-step equations and check the answer.', skill: 'two-step-equations' },
      { title: 'Equations with fractions', objective: 'Clear fractions before solving.', skill: 'fraction-equations' },
      { title: 'From word problem to equation', objective: 'Turn a short word problem into an equation and solve it.', skill: 'word-problems' },
    ],
  },
  read: {
    subject: 'reading',
    title: 'Finding the main idea',
    steps: [
      { title: 'Topic or main idea?', objective: 'Tell a topic apart from the point the author makes about it.', skill: 'topic-vs-main-idea' },
      { title: 'Spotting the key sentence', objective: 'Find the sentence that carries the main idea of a paragraph.', skill: 'key-sentences' },
      { title: 'Details that support it', objective: 'Pick the details that back up the main idea.', skill: 'supporting-details' },
      { title: 'When the main idea is not stated', objective: 'Infer the main idea from the details.', skill: 'making-inferences' },
      { title: 'Summing up a longer passage', objective: 'Write a one-sentence summary of a multi-paragraph text.', skill: 'summarizing' },
      { title: 'Citing lines as evidence', objective: 'Quote the line that proves an answer.', skill: 'citing-evidence' },
    ],
  },
  sci: {
    subject: 'biology',
    title: 'How cells work',
    steps: [
      { title: 'What counts as alive', objective: 'List the signs that something is living.', skill: 'characteristics-of-life' },
      { title: 'Inside a cell', objective: 'Name the main parts of a cell and what each does.', skill: 'cell-parts' },
      { title: 'Plant cells and animal cells', objective: 'Compare plant and animal cells.', skill: 'plant-vs-animal-cells' },
      { title: 'How cells get energy', objective: 'Explain photosynthesis and respiration in plain words.', skill: 'cell-energy' },
      { title: 'How cells divide', objective: 'Describe what happens when a cell divides.', skill: 'cell-division' },
      { title: 'From cells to body systems', objective: 'Connect cells, tissues, organs and systems.', skill: 'levels-of-organization' },
    ],
  },
}

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
  const text = `${lesson.title} ${lesson.objective} ${lesson.skills.join(' ')}`
  const bySkill = MOCK_LESSONS.find((item) => lesson.skills.includes(item.skill))
  const pool = MOCK_LESSONS.filter((item) => item.subject === subjectKey(text))
  const source = bySkill ?? pool[lesson.position % pool.length]
  const skill = lesson.skills[0] ?? source.skill
  const steps = (items: { text: string; eq?: string }[]) =>
    items.map((item, index) => `${index + 1}. ${item.text}${item.eq ? `\n\n   \`${item.eq}\`` : ''}`).join('\n\n')

  return {
    bodyMarkdown: [
      source.hook,
      `## The rule\n\n${source.rule}`,
      `## ${source.pointsTitle}\n\n${source.points.map((point) => `- ${point}`).join('\n')}`,
      source.passage && `## Read this\n\n${source.passage.map((line) => `> ${line}`).join('\n')}`,
      `## Worked example: ${source.exampleTitle}\n\n${steps(source.example)}`,
      `## Common slip\n\n${source.slip}`,
      `**Remember:** ${source.recap}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    questions: source.questions.map((question) => ({
      id: id(),
      prompt: question.prompt,
      choices: [...question.choices],
      correctIndex: question.correct,
      explanation: question.why,
      skill,
    })),
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
    const start = current ? current.position : lessons.length

    missingSkills.forEach((skill) =>
      inserted.push(
        newLesson(curriculum.id, start + inserted.length, 'remedial', {
          title: `${label(skill).charAt(0).toUpperCase()}${label(skill).slice(1)}, step by step`,
          objective: `Go back over ${label(skill)} in smaller steps before moving on.`,
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
      summary: missingSkills.length
        ? `The same slip kept showing up in ${missingSkills.map(label).join(' and ')}. These fix that first.`
        : 'The last few quizzes were a stretch. These go back over the basics first.',
      mistakes: missingSkills.map(
        (skill) =>
          `${wrong.filter((result) => result.skill === skill).length} missed answers on ${label(skill)} across the last ${window.length} quizzes.`,
      ),
      missingSkills,
    }
  } else {
    inserted.push(
      newLesson(curriculum.id, lessons.length, 'extension', {
        title: 'Going further',
        objective: 'Harder problems that build on everything so far.',
        skills: ['advanced-problems'],
      }),
    )
    diagnosis = {
      summary: `${window.length} strong quizzes in a row. Time for something harder.`,
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
  const outline = OUTLINES[subjectKey(body.prompt)]
  const curriculum: StoredCurriculum = {
    id: id(),
    childId: body.childId,
    bookId: body.bookId,
    prompt: body.prompt,
    subject: outline.subject,
    title: topic.split(' ').length <= 5 ? topic.charAt(0).toUpperCase() + topic.slice(1) : outline.title,
    replanStatus: 'idle',
    lastReplanAt: 0,
    replanReadyAt: null,
    pendingTrigger: null,
  }
  db.curricula.push(curriculum)
  outline.steps.forEach((step, position) =>
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
