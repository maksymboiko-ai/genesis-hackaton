'use client'

import { useSyncExternalStore } from 'react'

export type User = { name: string; email: string }
export type QuizAnswers = Record<string, string | string[]>

type Session = { user: User | null; quiz: QuizAnswers | null }

const STORAGE_KEY = 'session'
const EMPTY: Session = { user: null, quiz: null }

let current: Session | undefined
const listeners = new Set<() => void>()

function read(): Session {
  if (!current) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      current = raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY
    } catch {
      current = EMPTY
    }
  }
  return current!
}

function write(next: Session) {
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const setUser = (user: User) => write({ ...read(), user })
const setQuiz = (quiz: QuizAnswers) => write({ ...read(), quiz })
const signOut = () => write(EMPTY)

export function useSession() {
  const session = useSyncExternalStore(subscribe, read, () => null)

  return {
    ready: session !== null,
    user: session?.user ?? null,
    quiz: session?.quiz ?? null,
    setUser,
    setQuiz,
    signOut,
  }
}
