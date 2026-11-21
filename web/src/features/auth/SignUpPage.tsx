'use client'

import { CircleAlert } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useSession } from '@/lib/session'
import { AuthShell } from './AuthShell'

type Fields = { name: string; email: string; password: string }
type Errors = Partial<Record<keyof Fields, string>>

const MIN_PASSWORD = 8

function validate(fields: Fields): Errors {
  const errors: Errors = {}
  if (!fields.name.trim()) errors.name = 'Enter your name.'
  if (!/^\S+@\S+\.\S+$/.test(fields.email.trim())) errors.email = 'Enter a valid email address.'
  if (fields.password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`
  return errors
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
    <AuthShell>
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
        <p className="sm text-center">
          Have an account?{' '}
          <Link href="/login" className="font-bold text-link">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
