'use client'

import { useSyncExternalStore } from 'react'

export type User = { name: string; email: string }

type Session = { user: User | null; childId: string | null }

const STORAGE_KEY = 'session'
const EMPTY: Session = { user: null, childId: null }

let current: Session | undefined
const listeners = new Set<() => void>()

function read(): Session {
  if (!current) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const stored = raw ? JSON.parse(raw) : {}
      current = { user: stored.user ?? null, childId: stored.childId ?? null }
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
const setChildId = (childId: string | null) => write({ ...read(), childId })
const signIn = (user: User, childId: string | null) => write({ user, childId })
const signOut = () => write(EMPTY)

export function useSession() {
  const session = useSyncExternalStore(subscribe, read, () => null)

  return {
    ready: session !== null,
    user: session?.user ?? null,
    childId: session?.childId ?? null,
    setUser,
    setChildId,
    signIn,
    signOut,
  }
}
