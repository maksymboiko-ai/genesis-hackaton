'use client'

import { BarChart3, Check, ChevronDown, LogOut, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Child } from '@/contracts/domain'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { useResource } from '@/lib/useResource'
import { AVATARS } from './data'
import './product.css'

async function loadChildren() {
  const { children } = await api.listChildren()
  const counts = await Promise.all(
    children.map((child) => api.listCurricula(child.id).then((result) => result.curricula.length)),
  )
  return children.map((child, index) => ({ child, plans: counts[index] }))
}

export function Avatar({ child, index }: { child: Child; index: number }) {
  return (
    <span className="avatar" style={AVATARS[index % AVATARS.length]} aria-hidden="true">
      {child.name.charAt(0).toUpperCase()}
    </span>
  )
}

const planCount = (plans: number) => (plans === 0 ? 'no plans yet' : plans === 1 ? '1 plan' : `${plans} plans`)

export function ChildMenu() {
  const router = useRouter()
  const { childId, setChildId, signOut } = useSession()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(() => loadChildren(), [])
  const { data, reload } = useResource(load)

  useEffect(() => {
    reload()
  }, [childId, reload])

  const close = useCallback((refocus = false) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    wrapRef.current?.querySelector<HTMLElement>('[role="menu"] button')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  function onMenuKey(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button')]
    const at = items.indexOf(document.activeElement as HTMLElement)
    items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  const go = (path: string) => {
    close()
    router.push(path)
  }

  const currentIndex = data?.findIndex((entry) => entry.child.id === childId) ?? -1
  const current = data?.[currentIndex]?.child

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="child-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={current ? `${current.name}, switch child or sign out` : 'Account menu'}
        onClick={() => {
          if (!open) reload()
          setOpen(!open)
        }}
      >
        {current ? (
          <>
            <Avatar child={current} index={currentIndex} />
            <span className="max-w-[9rem] truncate">{current.name}</span>
          </>
        ) : (
          <span className="sk" style={{ width: 72, height: 20, marginLeft: 6 }} />
        )}
        <ChevronDown className="chev" size={18} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Children and account"
          className="pop right-0 top-[52px] flex w-[290px] max-w-[calc(100vw-24px)] flex-col gap-0.5 p-2"
          onKeyDown={onMenuKey}
        >
          {data?.map(({ child, plans }, index) => (
            <button
              key={child.id}
              type="button"
              role="menuitemradio"
              aria-checked={child.id === childId}
              className="menu-item child"
              onClick={() => {
                setChildId(child.id)
                go('/app')
              }}
            >
              <Avatar child={child} index={index} />
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-base font-bold">{child.name}</b>
                <span className="sm">
                  Grade {child.gradeLevel} · {planCount(plans)}
                </span>
              </span>
              {child.id === childId && <Check size={20} strokeWidth={2.6} className="text-math" aria-hidden="true" />}
            </button>
          ))}
          <i className="mx-2 my-1.5 block h-px bg-border" />
          {current && (
            <button type="button" role="menuitem" className="menu-item" onClick={() => go('/app/progress')}>
              <BarChart3 size={20} strokeWidth={2.2} aria-hidden="true" />
              {current.name}’s progress
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            style={{ color: 'var(--link)', fontWeight: 700 }}
            onClick={() => go('/app/children/new')}
          >
            <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
            Add a child
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              close()
              signOut()
            }}
          >
            <LogOut size={20} strokeWidth={2.2} aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
