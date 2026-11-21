export type Option = { value: string; label: string }

export type Question =
  | { id: string; type: 'single'; title: string; hint?: string; options: Option[] }
  | { id: string; type: 'multi'; title: string; hint?: string; options: Option[] }
  | { id: string; type: 'text'; title: string; hint?: string; placeholder?: string; optional?: boolean }

export const QUESTIONS: Question[] = [
  {
    id: 'goal',
    type: 'single',
    title: 'What brings you here?',
    options: [
      { value: 'explore', label: 'Just exploring' },
      { value: 'personal', label: 'A personal project' },
      { value: 'work', label: 'Something for work' },
    ],
  },
  {
    id: 'interests',
    type: 'multi',
    title: 'What are you interested in?',
    hint: 'Pick as many as you like.',
    options: [
      { value: 'a', label: 'Option A' },
      { value: 'b', label: 'Option B' },
      { value: 'c', label: 'Option C' },
      { value: 'd', label: 'Option D' },
    ],
  },
  {
    id: 'notes',
    type: 'text',
    title: 'Anything else we should know?',
    placeholder: 'Optional',
    optional: true,
  },
]
