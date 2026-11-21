'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { APP_NAME } from '@/lib/config'
import { useSession } from '@/lib/session'

type Fields = { name: string; email: string; password: string }
type Errors = Partial<Record<keyof Fields, string>>

const MIN_PASSWORD = 8

function validate(fields: Fields): Errors {
  const errors: Errors = {}
  if (!fields.name.trim()) errors.name = 'Enter your name.'
  if (!/^\S+@\S+\.\S+$/.test(fields.email.trim())) errors.email = 'Enter a valid email address.'
  if (fields.password.length < MIN_PASSWORD) {
    errors.password = `Use at least ${MIN_PASSWORD} characters.`
  }
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-12">
      <p className="text-sm font-medium text-muted">{APP_NAME}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Create your account</h1>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        <TextField label="Name" autoComplete="name" {...bind('name')} />
        <TextField label="Email" type="email" autoComplete="email" {...bind('email')} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD} characters.`}
          {...bind('password')}
        />

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </main>
  )
}
