import type { z } from 'zod'
import {
  ApiError,
  CreateBookResponse,
  CreateChildResponse,
  CreateCurriculumResponse,
  GetBookResponse,
  GetCurriculumResponse,
  GetLessonResponse,
  GetProfileResponse,
  ListBooksResponse,
  ListChildrenResponse,
  ListCurriculaResponse,
  SubmitAttemptResponse,
} from '@/contracts/api'
import type {
  CreateChildRequest,
  CreateCurriculumRequest,
  SubmitAttemptRequest,
} from '@/contracts/api'
import { mockFetch } from './api-mock'

const USE_MOCK = process.env.NEXT_PUBLIC_API_MOCK !== 'false'

export class ApiRequestError extends Error {
  code: ApiError['error']['code']

  constructor(code: ApiError['error']['code'], message: string) {
    super(message)
    this.code = code
  }
}

async function request<S extends z.ZodType>(
  schema: S,
  path: string,
  init?: RequestInit,
): Promise<z.infer<S>> {
  const response = USE_MOCK ? await mockFetch(path, init) : await fetch(`/api${path}`, init)
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const parsed = ApiError.safeParse(body)
    throw parsed.success
      ? new ApiRequestError(parsed.data.error.code, parsed.data.error.message)
      : new ApiRequestError('internal', 'Something went wrong. Try again.')
  }

  return schema.parse(body)
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  listChildren: () => request(ListChildrenResponse, '/children'),
  createChild: (body: CreateChildRequest) => request(CreateChildResponse, '/children', post(body)),
  getProfile: (childId: string) => request(GetProfileResponse, `/children/${childId}/profile`),

  listBooks: () => request(ListBooksResponse, '/books'),
  getBook: (bookId: string) => request(GetBookResponse, `/books/${bookId}`),
  createBook: (title: string, file: File) => {
    const form = new FormData()
    form.set('title', title)
    form.set('file', file)
    return request(CreateBookResponse, '/books', { method: 'POST', body: form })
  },

  listCurricula: (childId: string) =>
    request(ListCurriculaResponse, `/curricula?childId=${encodeURIComponent(childId)}`),
  createCurriculum: (body: CreateCurriculumRequest) =>
    request(CreateCurriculumResponse, '/curricula', post(body)),
  getCurriculum: (curriculumId: string) =>
    request(GetCurriculumResponse, `/curricula/${curriculumId}`),

  getLesson: (lessonId: string) => request(GetLessonResponse, `/lessons/${lessonId}`),
  submitAttempt: (lessonId: string, body: SubmitAttemptRequest) =>
    request(SubmitAttemptResponse, `/lessons/${lessonId}/attempts`, post(body)),
}
