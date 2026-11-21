'use client'

import { ChevronLeft, Lock } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/Button'
import { StatusNote } from '@/components/StatusNote'
import { TextField } from '@/components/TextField'
import { TRIAL_DAYS } from '@/contracts/domain'
import type { BillingPlan } from '@/contracts/domain'
import { api } from '@/lib/api'
import { PRICING } from '@/lib/config'

// A mock-up of the card step: there is no billing provider yet. What is typed
// here is checked for shape and then dropped; it is never sent or stored.

const PROCESSING_MS = 1400
const DAY_MS = 24 * 60 * 60 * 1000

type Fields = { card: string; expiry: string; cvc: string; name: string; zip: string }
type Errors = Partial<Record<keyof Fields, string>>

const digits = (value: string) => value.replace(/\D/g, '')
const isAmex = (number: string) => /^3[47]/.test(number)

function brandOf(number: string) {
  if (/^4/.test(number)) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'Mastercard'
  if (isAmex(number)) return 'Amex'
  if (/^6/.test(number)) return 'Discover'
  return null
}

function formatCard(value: string) {
  const number = digits(value).slice(0, isAmex(digits(value)) ? 15 : 16)
  const groups = isAmex(number)
    ? [number.slice(0, 4), number.slice(4, 10), number.slice(10)]
    : (number.match(/.{1,4}/g) ?? [])
  return groups.filter(Boolean).join(' ')
}

function formatExpiry(value: string) {
  const number = digits(value).slice(0, 4)
  return number.length > 2 ? `${number.slice(0, 2)} / ${number.slice(2)}` : number
}

// The check digit every real card number carries.
function passesLuhn(number: string) {
  let sum = 0
  for (let index = 0; index < number.length; index++) {
    let digit = Number(number[number.length - 1 - index])
    if (index % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

function validate(fields: Fields, now: Date): Errors {
  const errors: Errors = {}
  const number = digits(fields.card)
  if (number.length !== (isAmex(number) ? 15 : 16) || !passesLuhn(number)) errors.card = 'Enter a valid card number.'

  const expiry = digits(fields.expiry)
  const month = Number(expiry.slice(0, 2))
  const year = 2000 + Number(expiry.slice(2))
  if (expiry.length !== 4 || month < 1 || month > 12) errors.expiry = 'Use MM / YY.'
  else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    errors.expiry = 'This card has expired.'
  }

  if (digits(fields.cvc).length !== (isAmex(number) ? 4 : 3)) errors.cvc = 'Check the security code.'
  if (!fields.name.trim()) errors.name = 'Enter the name on the card.'
  if (digits(fields.zip).length !== 5) errors.zip = 'Enter a 5-digit ZIP code.'
  return errors
}

const FORMAT: Partial<Record<keyof Fields, (value: string) => string>> = {
  card: formatCard,
  expiry: formatExpiry,
  cvc: (value) => digits(value).slice(0, 4),
  zip: (value) => digits(value).slice(0, 5),
}

export function Checkout({ billing, onBack, onStarted }: { billing: BillingPlan; onBack: () => void; onStarted: () => void }) {
  const [fields, setFields] = useState<Fields>({ card: '', expiry: '', cvc: '', name: '', zip: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [firstCharge] = useState(() =>
    new Date(Date.now() + TRIAL_DAYS * DAY_MS).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  )

  const price = billing === 'yearly' ? PRICING.yearly : PRICING.monthly
  const brand = brandOf(digits(fields.card))

  const bind = (key: keyof Fields) => ({
    name: key,
    value: fields[key],
    error: errors[key],
    disabled: submitting,
    onChange: (event: { target: { value: string } }) => {
      const value = FORMAT[key]?.(event.target.value) ?? event.target.value
      setFields((prev) => ({ ...prev, [key]: value }))
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    },
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const found = validate(fields, new Date())
    setErrors(found)
    const firstInvalid = (Object.keys(fields) as (keyof Fields)[]).find((key) => found[key])
    if (firstInvalid) {
      form.querySelector<HTMLInputElement>(`[name="${firstInvalid}"]`)?.focus()
      return
    }

    setSubmitting(true)
    setFailed(null)
    try {
      // Stands in for the card check a billing provider would run.
      await new Promise((resolve) => setTimeout(resolve, PROCESSING_MS))
      await api.startTrial({ plan: billing })
      onStarted()
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Something went wrong. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="a-rise mt-auto flex flex-col gap-3 pb-6 md:mt-0">
      <button type="button" className="btn q sm-btn -ml-3 gap-1 self-start !px-2.5" onClick={onBack} disabled={submitting}>
        <ChevronLeft size={19} strokeWidth={2.4} aria-hidden="true" />
        Plans
      </button>
      <h2 className="text-2xl leading-tight font-extrabold tracking-[-0.02em]">Start your free trial</h2>

      <dl className="m-0 flex flex-col gap-2 rounded-[16px] bg-surface-2 px-4 py-3.5 text-[15px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-bold">Due today</dt>
          <dd className="m-0 font-bold">$0.00</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-muted">
          <dt>
            {billing === 'yearly' ? 'Yearly' : 'Monthly'} plan, from {firstCharge}
          </dt>
          <dd className="m-0 whitespace-nowrap">{price}</dd>
        </div>
      </dl>

      <TextField
        label="Card number"
        inputMode="numeric"
        autoComplete="cc-number"
        hint={brand ?? undefined}
        {...bind('card')}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="MM / YY" inputMode="numeric" autoComplete="cc-exp" {...bind('expiry')} />
        <TextField label="CVC" inputMode="numeric" autoComplete="cc-csc" {...bind('cvc')} />
      </div>
      <TextField label="Name on card" autoComplete="cc-name" {...bind('name')} />
      <TextField label="ZIP code" inputMode="numeric" autoComplete="postal-code" {...bind('zip')} />

      {failed && <StatusNote tone="error">{failed}</StatusNote>}
      <Button type="submit" block busy={submitting} className="mt-1.5">
        {!submitting && <Lock size={18} strokeWidth={2.4} aria-hidden="true" />}
        {submitting ? 'Checking your card…' : `Start ${PRICING.trial} free trial`}
      </Button>
      <p className="sm text-center">
        You won’t be charged today. Cancel anytime before {firstCharge} and you pay nothing.
      </p>
      <StatusNote>Demo checkout: no card is charged or saved. Use the test card 4242 4242 4242 4242.</StatusNote>
    </form>
  )
}
