'use client'

import { useCallback, useEffect, useState } from 'react'

type State<T> = { source: unknown; data: T | null; error: string | null }

export function useResource<T>(
  load: (() => Promise<T>) | null,
  pollWhile?: (data: T) => boolean,
  intervalMs = 1500,
) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<State<T>>({ source: null, data: null, error: null })

  useEffect(() => {
    if (!load) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      try {
        const data = await load()
        if (cancelled) return
        setState({ source: load, data, error: null })
        if (pollWhile?.(data)) timer = setTimeout(run, intervalMs)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Something went wrong. Try again.'
        setState({ source: load, data: null, error: message })
      }
    }
    run()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [load, pollWhile, intervalMs, version])

  const reload = useCallback(() => setVersion((value) => value + 1), [])
  const fresh = load !== null && state.source === load

  return {
    data: fresh ? state.data : null,
    error: fresh ? state.error : null,
    loading: load !== null && !fresh,
    reload,
  }
}
