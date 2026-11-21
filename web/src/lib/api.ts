import type { QuizAnswers, User } from './session'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type SignUpInput = { name: string; email: string; password: string }

export async function signUp(input: SignUpInput): Promise<User> {
  await delay(400)
  return { name: input.name, email: input.email }
}

export async function saveQuiz(answers: QuizAnswers): Promise<QuizAnswers> {
  await delay(300)
  return answers
}
