'use client'

import { Atom, BookOpen, CircleAlert, FlaskConical, Landmark, MessageCircle, Pencil, Triangle } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/Button'
import { SubjectIcon } from '@/components/SubjectTile'
import { TextField } from '@/components/TextField'
import { Wordmark } from '@/components/Wordmark'
import { useSession } from '@/lib/session'

type Fields = { name: string; email: string; password: string }
type Errors = Partial<Record<keyof Fields, string>>

const MIN_PASSWORD = 8
const ICON = { size: 24, strokeWidth: 2.2, 'aria-hidden': true } as const

const TILES: { label: string; background: string; dark?: boolean; icon: ReactNode }[] = [
  { label: 'Math', background: '#2563EB', icon: <SubjectIcon subject="math" /> },
  { label: 'Reading', background: '#E04A33', icon: <BookOpen {...ICON} /> },
  { label: 'Science', background: '#15924F', icon: <FlaskConical {...ICON} /> },
  { label: 'Writing', background: '#FFC83D', dark: true, icon: <Pencil {...ICON} /> },
  { label: 'History', background: '#7C4DDB', icon: <Landmark {...ICON} /> },
  { label: 'Spanish', background: '#D9457F', icon: <MessageCircle {...ICON} /> },
  { label: 'Geometry', background: '#F2811D', dark: true, icon: <Triangle {...ICON} /> },
  { label: 'Chemistry', background: '#0E8C8C', icon: <Atom {...ICON} /> },
]

function validate(fields: Fields): Errors {
  const errors: Errors = {}
  if (!fields.name.trim()) errors.name = 'Enter your name.'
  if (!/^\S+@\S+\.\S+$/.test(fields.email.trim())) errors.email = 'Enter a valid email address.'
  if (fields.password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`
  return errors
}

function Tile({
  tile,
  size,
  delay,
  fluid,
}: {
  tile: (typeof TILES)[number]
  size: number
  delay?: number
  fluid?: boolean
}) {
  return (
    <div
      className="a-pop flex aspect-square flex-none flex-col justify-between overflow-hidden"
      style={{
        width: fluid ? undefined : size,
        borderRadius: Math.round(size * 0.21),
        padding: Math.round(size * 0.12),
        background: tile.background,
        color: tile.dark ? '#16181F' : '#FFFFFF',
        animationDelay: delay ? `${delay}ms` : undefined,
      }}
    >
      {tile.icon}
      <span className="text-[13px] leading-tight font-bold md:text-sm">{tile.label}</span>
    </div>
  )
}

export function SignUpPage() {
  const router = useRouter()
  const { setUser } = useSession()
  const [fields, setFields] = useState<Fields>({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)

  const bind = (key: keyof Fields) => ({
    name: key,
    value: fields[key],
    error: errors[key],
    onChange: (event: { target: { value: string } }) => {
      setFields((prev) => ({ ...prev, [key]: event.target.value }))
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validate(fields)
    setErrors(found)
    const firstInvalid = (Object.keys(found) as (keyof Fields)[])[0]
    if (firstInvalid) {
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${firstInvalid}"]`)?.focus()
      return
    }

    setSubmitting(true)
    setUser({ name: fields.name.trim(), email: fields.email.trim() })
    router.push('/quiz')
  }

  const errorCount = Object.values(errors).filter(Boolean).length

  return (
    <main className="flex min-h-svh flex-col lg:grid lg:min-h-dvh lg:grid-cols-2">
      <section className="mx-auto flex w-full max-w-[560px] flex-col lg:mx-0 lg:max-w-none lg:bg-[#FAFAFC] lg:px-[72px] lg:py-12">
        <div className="px-6 pt-7 lg:p-0">
          <Wordmark />
        </div>

        <div aria-hidden="true" className="mt-7 overflow-hidden lg:hidden">
          <div className="marquee flex w-max gap-2 pl-6" style={{ animation: 'marquee 40s linear infinite' }}>
            {[...TILES, ...TILES].map((tile, at) => (
              <Tile key={at} tile={tile} size={84} />
            ))}
          </div>
        </div>

        <div className="stagger flex flex-col gap-2.5 px-6 pt-7 lg:mt-[120px] lg:gap-4 lg:p-0">
          <h1 className="h">
            Learns your kid.
            <br />
            Fixes the plan.
          </h1>
          <p className="sub lg:text-[19px]">Short lessons that adapt after every quiz.</p>
        </div>

        <div aria-hidden="true" className="mt-auto hidden grid-cols-[repeat(4,minmax(0,96px))] gap-3 pt-12 lg:grid">
          {TILES.map((tile, at) => (
            <Tile key={tile.label} tile={tile} size={96} delay={200 + at * 60} fluid />
          ))}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-end px-6 pt-8 pb-6 lg:mx-0 lg:max-w-none lg:items-center lg:justify-center lg:p-12">
        <form onSubmit={handleSubmit} noValidate className="a-rise flex w-full flex-col gap-3 lg:max-w-[400px] lg:gap-3.5">
          <h2 className="mb-2 hidden text-[28px] leading-tight font-extrabold tracking-[-0.02em] lg:block">
            Create your account
          </h2>
          {errorCount > 0 && (
            <p role="alert" className="a-fade flex items-start gap-2 rounded-[14px] bg-danger-soft px-4 py-3 text-sm font-bold text-danger">
              <CircleAlert size={18} strokeWidth={2.2} aria-hidden="true" className="mt-px flex-none" />
              {errorCount === 1 ? 'Fix 1 field to continue.' : `Fix ${errorCount} fields to continue.`}
            </p>
          )}
          <TextField label="Your name" autoComplete="name" {...bind('name')} />
          <TextField label="Email" type="email" autoComplete="email" {...bind('email')} />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            hint={`At least ${MIN_PASSWORD} characters.`}
            {...bind('password')}
          />
          <Button type="submit" block busy={submitting} className="mt-1.5">
            Create account
          </Button>
        </form>
      </section>
    </main>
  )
}
