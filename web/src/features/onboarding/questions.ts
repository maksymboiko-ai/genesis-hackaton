import { findGradeSubject, subjectsForGrade } from '@/contracts/subjects'

export type Option = { value: string; label: string }

export type Answers = {
  name: string
  gradeLevel: number | null
  // Grade subjects by their school name.
  subjects: string[]
  pace: string | null
  format: string | null
  obstacles: string[]
  goal: string
}

export const EMPTY_ANSWERS: Answers = {
  name: '',
  gradeLevel: null,
  subjects: [],
  pace: null,
  format: null,
  obstacles: [],
  goal: '',
}

export const QUESTIONS = ['name', 'grade', 'subjects', 'pace', 'format', 'obstacles', 'goal'] as const
export type QuestionId = (typeof QUESTIONS)[number]

export type InfoId = 'stat-school' | 'stat-anxiety' | 'explainer'

export type Screen = { kind: 'question'; id: QuestionId } | { kind: 'info'; id: InfoId; after: QuestionId }

export const SCREENS: Screen[] = [
  { kind: 'question', id: 'name' },
  { kind: 'question', id: 'grade' },
  { kind: 'question', id: 'subjects' },
  { kind: 'question', id: 'pace' },
  { kind: 'info', id: 'stat-school', after: 'pace' },
  { kind: 'question', id: 'format' },
  { kind: 'question', id: 'obstacles' },
  { kind: 'info', id: 'stat-anxiety', after: 'obstacles' },
  { kind: 'info', id: 'explainer', after: 'obstacles' },
  { kind: 'question', id: 'goal' },
]

export const GRADES = Array.from({ length: 12 }, (_, index) => index + 1)

export const MAX_OBSTACLES = 2
export const GOAL_MAX = 2000

export const PACE: (Option & { level: number })[] = [
  { value: 'ahead', label: 'Ahead and often bored', level: 4 },
  { value: 'steady', label: 'Fine, could be more confident', level: 3 },
  { value: 'gaps', label: 'Keeping up, some topics are hard', level: 2 },
  { value: 'struggling', label: 'Struggling and losing confidence', level: 1 },
]

export const FORMAT: (Option & { color: string; short: string })[] = [
  { value: 'worked-example', label: 'Seeing a worked example', color: 'var(--math)', short: 'worked examples first' },
  { value: 'step-by-step', label: 'A step-by-step explanation', color: 'var(--read)', short: 'step by step' },
  { value: 'real-life', label: 'Connecting it to real life', color: 'var(--sci)', short: 'real-life examples' },
]

export const OBSTACLES: (Option & { reply: (name: string) => string })[] = [
  {
    value: 'careless',
    label: 'Rushes, small mistakes',
    reply: (name) => `You said ${name} rushes. Every lesson ends with a quick check-your-answer step.`,
  },
  {
    value: 'mistakes',
    label: 'Worries about being wrong',
    reply: (name) =>
      `You said ${name} worries about being wrong. Lessons start with wins, and mistakes get a calm explanation.`,
  },
  {
    value: 'focus',
    label: 'Gets distracted',
    reply: (name) => `You said ${name} gets distracted. Lessons stay short, with the key point first.`,
  },
  {
    value: 'gives-up',
    label: 'Gives up when it’s hard',
    reply: (name) => `You said ${name} gives up when it’s hard. Hard topics are split into small steps that build up.`,
  },
  {
    value: 'forgets',
    label: 'Forgets what was taught',
    reply: (name) => `You said ${name} forgets what was taught. Earlier skills come back in later quizzes.`,
  },
]

export function schoolLine(pace: string | null, name: string) {
  return pace === 'ahead' || pace === 'steady'
    ? 'Good grades can hide gaps. The first lessons find them.'
    : `${name} is far from alone.`
}

export function anxietyLine(obstacles: string[], name: string) {
  const first = OBSTACLES.find((option) => obstacles.includes(option.value))
  return first ? first.reply(name) : `Lessons are shaped around how ${name} learns.`
}

export function heading(id: QuestionId, name: string): { title: string; hint?: string } {
  switch (id) {
    case 'name':
      return { title: 'What’s your child’s name?' }
    case 'grade':
      return { title: `What grade is ${name} in?` }
    case 'subjects':
      return { title: `What should ${name} get help with?`, hint: 'Pick one or more.' }
    case 'pace':
      return { title: `How is school going for ${name}?` }
    case 'format':
      return { title: `What helps ${name} understand something new?` }
    case 'obstacles':
      return { title: `What gets in the way when ${name} studies?`, hint: `Pick up to ${MAX_OBSTACLES}.` }
    case 'goal':
      return { title: `What should ${name} work on first?`, hint: 'Say it like you’d tell a tutor.' }
  }
}

export function isAnswered(id: QuestionId, answers: Answers) {
  switch (id) {
    case 'name':
      return answers.name.trim().length > 0
    case 'grade':
      return answers.gradeLevel !== null
    case 'subjects':
      return answers.subjects.length > 0
    case 'pace':
      return answers.pace !== null
    case 'format':
      return answers.format !== null
    case 'obstacles':
      return answers.obstacles.length > 0
    case 'goal':
      return answers.goal.trim().length > 0
  }
}

// Hand-picked goals for each grade's core English, math and science course.
const STARTERS: Record<'math' | 'read' | 'sci', string[][]> = {
  math: [
    ['Counting to 100', 'Adding within 20', 'Shapes and patterns'],
    ['Two-digit addition', 'Skip counting', 'Telling time'],
    ['Borrowing in subtraction', 'Times tables', 'Intro to fractions'],
    ['Long multiplication', 'Equivalent fractions', 'Area and perimeter'],
    ['Adding unlike fractions', 'Decimals', 'Long division'],
    ['Ratios and rates', 'Negative numbers', 'Intro to equations'],
    ['Percents', 'One-step equations', 'Proportions'],
    ['Two-step equations', 'Slope', 'Pythagorean theorem'],
    ['Factoring quadratics', 'Systems of equations', 'Exponent rules'],
    ['Geometry proofs', 'Similar triangles', 'Circle theorems'],
    ['Trig functions', 'Logarithms', 'SAT math prep'],
    ['Derivatives', 'Limits', 'Statistics and probability'],
  ],
  read: [
    ['Sounding out words', 'Sight words', 'Letter formation'],
    ['Reading aloud smoothly', 'Story characters', 'Writing a short story'],
    ['Reading longer words', 'Main idea', 'Writing a paragraph'],
    ['Summarizing a chapter', 'Context clues', 'Opinion paragraph'],
    ['Theme of a story', 'Comparing two texts', 'Five-paragraph essay'],
    ['Finding the main idea', 'Making inferences', 'Essay structure'],
    ['Citing evidence', 'Figurative language', 'Argument essay'],
    ['Analyzing an argument', 'Character motives', 'Thesis statements'],
    ['Close reading', 'Shakespeare basics', 'Literary analysis essay'],
    ['Analyzing a poem', 'Rhetorical devices', 'Argumentative essay'],
    ['SAT reading prep', 'American literature', 'Rhetorical analysis'],
    ['AP Lit passages', 'Critical reading', 'College essay'],
  ],
  sci: [
    ['Living vs. nonliving', 'Weather and seasons', 'Plant parts'],
    ['Life cycles', 'States of matter', 'Habitats'],
    ['Forces and motion', 'Animal adaptations', 'Weather patterns'],
    ['Energy', 'Rocks and minerals', 'Body systems'],
    ['Food webs', 'Earth and space', 'Mixtures and solutions'],
    ['Scientific method', 'Cells', 'Earth’s layers'],
    ['Cells and genetics', 'Chemical reactions', 'Human body'],
    ['Newton’s laws', 'Atoms and elements', 'Plate tectonics'],
    ['Cell biology', 'Genetics', 'Lab reports'],
    ['Balancing equations', 'Stoichiometry', 'Periodic table'],
    ['Physics of motion', 'AP Biology', 'Electricity'],
    ['AP Chemistry', 'AP Physics', 'Environmental science'],
  ],
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// Goals for one subject: the hand-picked ones for a core course, else the
// topics its blurb names ("Supply and demand, markets, money").
function startersFor(grade: number, name: string): string[] {
  const subjects = subjectsForGrade(grade)
  const subject = findGradeSubject(grade, name) ?? subjects[0]
  const core = subjects.findIndex((item) => item.family === subject.family) === subjects.indexOf(subject)
  if (core && (subject.family === 'math' || subject.family === 'read' || subject.family === 'sci')) {
    return STARTERS[subject.family][grade - 1]
  }
  return subject.blurb.split(/,\s*/).map(cap)
}

export function goalStarters(gradeLevel: number | null, subjects: string[]) {
  const grade = gradeLevel ?? 6
  const picked = subjects.length ? subjects : [subjectsForGrade(grade)[1].name]
  if (picked.length === 1) return startersFor(grade, picked[0]).map((label) => ({ subject: picked[0], label }))
  return picked.slice(0, 4).map((subject) => ({ subject, label: startersFor(grade, subject)[0] }))
}
