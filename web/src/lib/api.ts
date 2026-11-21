import type { z } from 'zod'
import {
  ApiError,
  AuthResponse,
  CreateBookResponse,
  CreateChildResponse,
  CreateCurriculumResponse,
  ExtendCurriculumResponse,
  GetBookResponse,
  GetCurriculumResponse,
  GetLessonResponse,
  GetProfileResponse,
  ListBooksResponse,
  ListChildrenResponse,
  ListCurriculaResponse,
  LogoutResponse,
  RetryLessonResponse,
  SubmitAttemptResponse,
} from '@/contracts/api'
import type {
  CreateChildRequest,
  CreateCurriculumRequest,
  LoginRequest,
  SignUpRequest,
  SubmitAttemptRequest,
} from '@/contracts/api'
import { mockFetch } from './api-mock'
import { clearSession } from './session'

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

  // The session is gone (expired or signed out elsewhere): back to sign-in.
  // Auth endpoints handle their own 401s (wrong password, not signed in).
  if (response.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined') {
    clearSession()
    // A full page load on purpose: it drops every in-memory screen state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login')
  }

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
  // Accounts. The session lives in httpOnly cookies the server sets.
  signUp: (body: SignUpRequest) => request(AuthResponse, '/auth/signup', post(body)),
  logIn: (body: LoginRequest) => request(AuthResponse, '/auth/login', post(body)),
  logOut: () => request(LogoutResponse, '/auth/logout', { method: 'POST' }),
  me: () => request(AuthResponse, '/auth/me'),

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
  // "Keep going" on a finished plan: plans and appends the next lessons.
  extendCurriculum: (curriculumId: string) =>
    request(ExtendCurriculumResponse, `/curricula/${curriculumId}/extend`, { method: 'POST' }),

  getLesson: (lessonId: string) => request(GetLessonResponse, `/lessons/${lessonId}`),
  // "Try again" on a failed lesson.
  retryLesson: (lessonId: string) =>
    request(RetryLessonResponse, `/lessons/${lessonId}/retry`, { method: 'POST' }),
  submitAttempt: (lessonId: string, body: SubmitAttemptRequest) =>
    request(SubmitAttemptResponse, `/lessons/${lessonId}/attempts`, post(body)),
}
