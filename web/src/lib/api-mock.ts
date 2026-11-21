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
  CreateBookRequest,
  CreateChildRequest,
  CreateCurriculumRequest,
  SubmitAttemptRequest,
} from '@/contracts/api'
import type { ApiError } from '@/contracts/api'
import { MOCK_LESSONS } from './api-mock-lessons'
import { gradeSubjectFor } from '@/contracts/subjects'
import { subjectKey } from './subjects'

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
  // Mock accounts. Passwords are kept as typed: this is a local demo only.
  accounts: { id: string; name: string; email: string; password: string }[]
  signedIn: string | null
}

const STORAGE_KEY = 'mock-api'
const NETWORK_MS = 250
const OUTLINE_MS = 1500
const LESSON_MS = 2000
const BOOK_MS = 3000
const REPLAN_MS = 3000

type MockOutline = { subject: string; title: string; steps: { title: string; objective: string; skill: string }[] }

const OUTLINES: Record<'math' | 'read' | 'sci', MockOutline> = {
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

// Core subjects get a full outline; the rest a short one from the topics
// their blurb names.
function outlineFor(name: string, family: string, blurb: string): MockOutline {
  if (family === 'math' || family === 'read' || family === 'sci') return OUTLINES[family]
  const topics = blurb.split(/,\s*/)
  return {
    subject: name,
    title: `${name} basics`,
    steps: topics.map((topic) => ({
      title: topic.charAt(0).toUpperCase() + topic.slice(1),
      objective: `Explain the key ideas of ${topic.toLowerCase()}.`,
      skill: topic.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    })),
  }
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
    accounts: [],
    signedIn: null,
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
    // Mock only: the backend takes the model's estimate, then computes it from the content.
    estimatedMinutes: outline.estimatedMinutes ?? 6 + (outline.title.length % 6),
    contentStatus: 'pending',
    questionCount: null,
    completedAt: null,
    lastScore: null,
    content: null,
    readyAt: null,
  }
}

function buildContent(lesson: StoredLesson): LessonContent {
  const text = `${lesson.title} ${lesson.objective} ${lesson.skills.join(' ')}`
  const bySkill = MOCK_LESSONS.find((item) => lesson.skills.includes(item.skill))
  const family = MOCK_LESSONS.filter((item) => item.subject === subjectKey(text))
  const pool = family.length ? family : MOCK_LESSONS
  const source = bySkill ?? pool[lesson.position % pool.length]
  const skill = lesson.skills[0] ?? source.skill
  const extra = source.blocks ?? []

  return {
    bodyMarkdown: [
      source.hook,
      `## The rule\n\n${source.rule}`,
      `## ${source.pointsTitle}\n\n${source.points.map((point) => `- ${point}`).join('\n')}`,
      ...extra.map((block) => `[[${block.id}]]`),
      source.passage && `## Read this\n\n${source.passage.map((line) => `> ${line}`).join('\n')}`,
      `## Worked example: ${source.exampleTitle}\n\n[[steps-1]]`,
      `## Common slip\n\n${source.slip}`,
      `**Remember:** ${source.recap}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    blocks: [
      ...extra,
      {
        type: 'steps',
        id: 'steps-1',
        title: source.exampleTitle,
        steps: source.example.map((item) => ({ text: item.text, math: item.eq ?? '' })),
      },
    ],
    questions: source.questions.map((question) => ({
      id: id(),
      prompt: question.prompt,
      choices: [...question.choices],
      correctIndex: question.correct,
      explanation: question.why,
      // What a child who picked each choice is told; the real lesson model
      // names the slip behind each wrong choice.
      choiceFeedback: question.choices.map((choice, index) =>
        index === question.correct ? question.why : `"${choice}" is not it. ${question.why}`,
      ),
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
        }, null, `Your answers on ${label(skill)} went different ways, so we start from the idea underneath it.`),
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
      summary: missingSkills.length
        ? `The same slip kept showing up in ${missingSkills.map(label).join(' and ')}. These fix that first.`
        : 'The last few quizzes were a stretch. These go back over the basics first.',
      mistakes: missingSkills.map(
        (skill) =>
          `${wrong.filter((result) => result.skill === skill).length} missed answers on ${label(skill)} across the last ${window.length} quizzes.`,
      ),
      childMessage: 'Your answers showed us exactly where things slip. A couple of short lessons come first, so the next part feels easier.',
      missingSkills,
    }
  } else {
    inserted.push(
      newLesson(curriculum.id, lessons.length, 'extension', {
        title: 'Going further',
        objective: 'Harder problems that build on everything so far.',
        skills: ['advanced-problems'],
      }, null, 'You got nearly everything right three lessons in a row, so here is something harder.'),
    )
    diagnosis = {
      summary: `${window.length} strong quizzes in a row. Time for something harder.`,
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
  return { ...omit(lesson, 'content', 'readyAt'), questionCount: lesson.content?.questions.length ?? null }
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
  const child = find(db.children, body.childId, 'Child')
  await delay(OUTLINE_MS)

  const topic = body.prompt.trim().replace(/\s+/g, ' ')
  const subject = gradeSubjectFor(child.gradeLevel, body.subject ?? body.prompt)
  const outline = outlineFor(subject.name, subject.family, subject.blurb)
  const curriculum: StoredCurriculum = {
    id: id(),
    childId: body.childId,
    bookId: body.bookId,
    prompt: body.prompt,
    subject: subject.name,
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

const EXTEND_STEPS = [
  { title: 'Mixed practice', objective: 'Use everything from the plan so far on a mixed set of problems.' },
  { title: 'Harder problems', objective: 'Solve problems that need two ideas at once.' },
  { title: 'Using it in real situations', objective: 'Apply what you learned to problems from everyday life.' },
]

async function extendCurriculum(db: Db, curriculumId: string) {
  const curriculum = find(db.curricula, curriculumId, 'Curriculum')
  const lessons = lessonsOf(db, curriculum.id)
  if (curriculum.replanStatus === 'running') {
    throw new MockError(409, 'conflict', 'The plan is being updated. Try again in a moment.')
  }
  if (lessons.some((lesson) => !lesson.completedAt)) {
    throw new MockError(409, 'conflict', 'Finish the lessons in the plan first.')
  }
  await delay(OUTLINE_MS)

  const last = lessons.at(-1)
  const round = lessons.filter((lesson) => lesson.title.startsWith(EXTEND_STEPS[0].title)).length + 2
  const added = EXTEND_STEPS.map((step, index) =>
    newLesson(curriculum.id, lessons.length + index, 'core', {
      title: `${step.title} ${round}`,
      objective: step.objective,
      skills: last?.skills.length ? last.skills : ['mixed-practice'],
    }),
  )
  added[0].contentStatus = 'generating'
  added[0].readyAt = Date.now() + LESSON_MS
  db.lessons.push(...added)
  return publicCurriculum(db, curriculum)
}

function auth(db: Db, action: string, body: unknown) {
  const raw = typeof body === 'string' ? JSON.parse(body) : (body ?? {})
  const email = String(raw.email ?? '').trim().toLowerCase()
  const toUser = (account: Db['accounts'][number]) => ({ user: { id: account.id, email: account.email, name: account.name } })
  switch (action) {
    case 'signup': {
      if (db.accounts.some((account) => account.email === email)) {
        throw new MockError(409, 'conflict', 'An account with this email already exists.')
      }
      const account = { id: id(), name: String(raw.name ?? '').trim(), email, password: String(raw.password ?? '') }
      db.accounts.push(account)
      db.signedIn = account.id
      return toUser(account)
    }
    case 'login': {
      const account = db.accounts.find((candidate) => candidate.email === email && candidate.password === raw.password)
      if (!account) throw new MockError(401, 'unauthorized', 'Wrong email or password.')
      db.signedIn = account.id
      return toUser(account)
    }
    case 'logout':
      db.signedIn = null
      return { ok: true }
    case 'me': {
      const account = db.accounts.find((candidate) => candidate.id === db.signedIn)
      if (!account) throw new MockError(401, 'unauthorized', 'Sign in to continue.')
      return toUser(account)
    }
    default:
      throw new MockError(404, 'not_found', 'Not found.')
  }
}

function retryLesson(db: Db, lessonId: string) {
  const lesson = find(db.lessons, lessonId, 'Lesson')
  if (lesson.contentStatus === 'failed') lesson.contentStatus = 'pending'
  return getLesson(db, lessonId)
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
      // Lessons saved in the browser before blocks existed have none.
      blocks: lesson.content.blocks ?? [],
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
      explanation: question.choiceFeedback?.[answer.chosenIndex] ?? question.explanation,
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
    case 'GET children/:id/streak': {
      const child = find(db.children, itemId, 'Child')
      const plans = new Set(db.curricula.filter((plan) => plan.childId === child.id).map((plan) => plan.id))
      const pad = (value: number) => String(value).padStart(2, '0')
      const days = new Set(
        db.attempts
          .filter((attempt) => plans.has(attempt.curriculumId))
          .map((attempt) => new Date(attempt.at))
          .map((date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`),
      )
      return { days: [...days].sort().reverse() }
    }
    case 'GET books':
      return { books: db.books.map((book) => omit(book, 'readyAt')) }
    case 'POST books/:id': {
      if (itemId !== 'uploads') throw new MockError(404, 'not_found', 'No such endpoint.')
      // The client skips the PUT in mock mode, so the URL is never fetched.
      return { uploadId: id(), uploadUrl: 'http://mock.local/upload' }
    }
    case 'POST books': {
      const title = parseBody<CreateBookRequest>(CreateBookRequest, body).title.trim()
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
    case 'POST curricula/:id/extend':
      return extendCurriculum(db, itemId)
    case 'POST auth/:id':
    case 'GET auth/:id':
      return auth(db, itemId, body)
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
