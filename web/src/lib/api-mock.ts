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

// Bump the suffix when a stored shape changes, so old data is not parsed.
const STORAGE_KEY = 'mock-api-v2'
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
  outline: { title: string; objective: string; skills: string[]; estimatedMinutes?: number },
  retryOfLessonId: string | null = null,
  reason: string | null = null,
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
    reason,
    // Mock only: the real estimate comes from the outline, then the content.
    estimatedMinutes: outline.estimatedMinutes ?? 5 + (outline.title.length % 6),
    contentStatus: 'pending',
    completedAt: null,
    lastScore: null,
    content: null,
    readyAt: null,
  }
}

// A sample quiz with real numbers, so the mock shows what generated feedback
// looks like. Every mock lesson uses it; choice 0 is the correct one here and
// buildContent rotates the choices.
const SAMPLE_QUESTIONS = [
  {
    prompt: 'Solve for x.\n\n`x + 5 = -2`',
    choices: ['x = -7', 'x = 3', 'x = 7', 'x = -3'],
    feedback: [
      '5 was added, so you subtracted 5: -2 - 5 = -7.',
      'You added 5 to both sides instead of subtracting it. 5 was added to x, so subtract 5: -2 - 5 = -7.',
      'The steps were right, but the sign got lost on the way: -2 - 5 is -7, not 7.',
      'You subtracted 5 from 2, not from -2. Start from -2 and go 5 further down: -7.',
    ],
  },
  {
    prompt: 'Solve for x.\n\n`x - 6 = -10`',
    choices: ['x = -4', 'x = -16', 'x = 4', 'x = 16'],
    feedback: [
      '6 was subtracted, so you added 6: -10 + 6 = -4.',
      'You subtracted 6 again instead of undoing it. 6 was subtracted from x, so add 6: -10 + 6 = -4.',
      'Adding 6 was the right move, but -10 + 6 stays below zero: it is -4.',
      'You added 6 to 10, not to -10. Start from -10 and come 6 back up: -4.',
    ],
  },
  {
    prompt: 'Solve for x.\n\n`2x + 3 = -7`',
    choices: ['x = -5', 'x = -2', 'x = 5', 'x = -10'],
    feedback: [
      'You subtracted 3 first, then divided by 2: -10 / 2 = -5.',
      'You added 3 instead of subtracting it: -7 + 3 = -4, then -4 / 2 = -2. Subtract first: -7 - 3 = -10, and -10 / 2 = -5.',
      'The steps were right, but the minus sign was dropped at the end: -10 / 2 = -5.',
      'You stopped one step early. -10 is what 2x equals, so divide by 2: x = -5.',
    ],
  },
  {
    prompt: 'Solve for x.\n\n`-x + 4 = 9`',
    choices: ['x = -5', 'x = 5', 'x = 13', 'x = -13'],
    feedback: [
      'Subtract 4 to get -x = 5, then flip both signs: x = -5.',
      'You found -x = 5 and stopped. If the opposite of x is 5, then x is -5.',
      'You added 4 instead of subtracting it. 4 was added, so subtract: 9 - 4 = 5, which gives -x = 5 and x = -5.',
      'You added 4 instead of subtracting it. Subtract 4 to get -x = 5, so x = -5.',
    ],
  },
]

function buildContent(lesson: StoredLesson): LessonContent {
  const skills = lesson.skills.length ? lesson.skills : ['general']
  const questions = SAMPLE_QUESTIONS.map((sample, index) => {
    // Rotate the choices so the correct one is not always first.
    const correctIndex = (index + lesson.position) % CHOICES_PER_QUESTION
    const order = Array.from(
      { length: CHOICES_PER_QUESTION },
      (_, choice) => (choice - correctIndex + CHOICES_PER_QUESTION) % CHOICES_PER_QUESTION,
    )
    const choiceFeedback = order.map((from) => sample.feedback[from])
    return {
      id: id(),
      prompt: sample.prompt,
      choices: order.map((from) => sample.choices[from]),
      correctIndex,
      explanation: choiceFeedback[correctIndex],
      choiceFeedback,
      skill: skills[index % skills.length],
    }
  })

  return {
    bodyMarkdown: [
      'When you solve an equation, you undo whatever was done to `x`. The tool for undoing is the **opposite operation**: adding undoes subtracting, and subtracting undoes adding.',
      'The tricky part is negative numbers. They can hide which operation is really happening.',
      '## Read the sign first',
      'Look at `x + 5 = -2`. The number next to `x` is `+5`, so 5 was added. To undo it, subtract 5 from both sides.',
      '- `x + 5` means 5 was added, so **subtract 5**.\n- `x - 5` means 5 was subtracted, so **add 5**.\n- `x + (-5)` is the same as `x - 5`, so **add 5**.',
      '## Worked example',
      'Solve `3x + 4 = -11`',
      '1. Find what happened to `x` last: **4 was added**.\n2. Subtract 4 from both sides. `3x = -11 - 4 = -15`\n3. Undo the multiplying: divide both sides by 3. `x = -5`\n4. Check by putting it back in. `3(-5) + 4 = -11`',
      '## The two-second check',
      '1. Point at the number you want to move.\n2. Say its sign out loud: "plus four".\n3. Do the opposite: "so I subtract four".',
      'It feels slow. It catches the most common mistake in this whole plan.',
      '**Remember:** the sign belongs to the number. When the number moves, its sign decides what you do.',
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
        newLesson(
          curriculum.id,
          start + inserted.length,
          'remedial',
          {
            title: `Review: ${label(skill)}`,
            objective: `Rebuild ${label(skill)} from the ground up.`,
            skills: [skill],
          },
          null,
          `Your answers on ${label(skill)} went different ways, so we start from the idea underneath it.`,
        ),
      ),
    )
    failed.forEach((lesson) =>
      inserted.push(
        newLesson(
          curriculum.id,
          start + inserted.length,
          'retry',
          lesson,
          lesson.id,
          'A second try at this lesson, now that the review lessons are behind you.',
        ),
      ),
    )
    lessons
      .filter((lesson) => lesson.position >= start)
      .forEach((lesson) => (lesson.position += inserted.length))

    diagnosis = {
      summary: 'The last lessons were too hard, so review lessons come first.',
      childMessage:
        'Your answers showed us exactly where things slip. A couple of short lessons come first, so the next part feels easier.',
      mistakes: missingSkills.map((skill) => `Several wrong answers on ${label(skill)}.`),
      missingSkills,
    }
  } else {
    inserted.push(
      newLesson(
        curriculum.id,
        lessons.length,
        'extension',
        {
          title: 'Challenge: going further',
          objective: 'Harder problems for a learner who is ahead of the plan.',
          skills: ['advanced-problems'],
        },
        null,
        'You got nearly everything right three lessons in a row, so here is something harder.',
      ),
    )
    diagnosis = {
      summary: 'The last lessons went very well, so a harder lesson was added.',
      childMessage: 'You are ahead of the plan, so we added a challenge lesson at the end.',
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

function retryLesson(db: Db, lessonId: string) {
  const lesson = find(db.lessons, lessonId, 'Lesson')
  if (lesson.contentStatus === 'failed') lesson.contentStatus = 'pending'
  return getLesson(db, lessonId)
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
      explanation: question.choiceFeedback[answer.chosenIndex] ?? question.explanation,
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
  const right = results.filter((result) => result.correct).length
  const misses = results.length - right
  const feedback =
    misses === 0
      ? { headline: 'All of them held up.', summary: `${right} of ${results.length}. Nothing to look at again.` }
      : score >= STRUGGLING_BELOW
        ? { headline: 'Nice work.', summary: `${right} of ${results.length}. ${misses === 1 ? 'One' : misses} to look at again, below.` }
        : { headline: "This one was tricky. That's useful to know.", summary: `${right} of ${results.length}. The notes below show where it slipped.` }
  return { attemptId: attempt.id, score, results, feedback, replanTriggered, nextLessonId: next?.id ?? null }
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
    case 'POST lessons/:id/retry':
      return retryLesson(db, itemId)
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
