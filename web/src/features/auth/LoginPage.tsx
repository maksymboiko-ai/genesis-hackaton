'use client'

import { CircleAlert } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { AuthShell } from './AuthShell'

type Fields = { email: string; password: string }
type Errors = Partial<Record<keyof Fields, string>>

function validate(fields: Fields): Errors {
  const errors: Errors = {}
  if (!/^\S+@\S+\.\S+$/.test(fields.email.trim())) errors.email = 'Enter a valid email address.'
  if (!fields.password) errors.password = 'Enter your password.'
  return errors
}

function nameFromEmail(email: string) {
  const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim()
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Parent'
}

export function LoginPage() {
  const router = useRouter()
  const { signIn } = useSession()
  const [fields, setFields] = useState<Fields>({ email: '', password: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [failed, setFailed] = useState(false)

  const bind = (key: keyof Fields) => ({
    name: key,
    value: fields[key],
    error: errors[key],
    onChange: (event: { target: { value: string } }) => {
      setFields((prev) => ({ ...prev, [key]: event.target.value }))
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    },
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const found = validate(fields)
    setErrors(found)
    const firstInvalid = (Object.keys(found) as (keyof Fields)[])[0]
    if (firstInvalid) {
      form.querySelector<HTMLInputElement>(`[name="${firstInvalid}"]`)?.focus()
      return
    }

    setSubmitting(true)
    setFailed(false)
    try {
      const email = fields.email.trim()
      const { children } = await api.listChildren()
      const childId = children[0]?.id ?? null
      signIn({ name: nameFromEmail(email), email }, childId)
      router.push(childId ? '/app' : '/quiz')
    } catch {
      setFailed(true)
      setSubmitting(false)
    }
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} noValidate className="a-rise flex w-full flex-col gap-3 lg:max-w-[400px] lg:gap-3.5">
        <h2 className="mb-2 text-[28px] leading-tight font-extrabold tracking-[-0.02em]">Welcome back</h2>
        {failed && (
          <p role="alert" className="a-fade flex items-start gap-2 rounded-[14px] bg-danger-soft px-4 py-3 text-sm font-bold text-danger">
            <CircleAlert size={18} strokeWidth={2.2} aria-hidden="true" className="mt-px flex-none" />
            Could not sign you in. Try again.
          </p>
        )}
        <TextField label="Email" type="email" autoComplete="email" {...bind('email')} />
        <TextField label="Password" type="password" autoComplete="current-password" {...bind('password')} />
        <Button type="submit" block busy={submitting} className="mt-1.5">
          Sign in
        </Button>
        <p className="sm text-center">
          New here?{' '}
          <Link href="/signup" className="font-bold text-link">
            Create an account
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
