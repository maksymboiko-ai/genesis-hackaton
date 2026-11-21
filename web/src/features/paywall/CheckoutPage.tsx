'use client'

import { ChevronLeft, Info, Lock } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Button } from '@/components/Button'
import { StatusNote } from '@/components/StatusNote'
import { TextField } from '@/components/TextField'
import { Wordmark } from '@/components/Wordmark'
import { api } from '@/lib/api'
import { OFFERS, isBilling, nextChargeDate, planFor, saveReceipt } from './billing'

// A pretend payment step: any card details pass as long as every field is
// filled in. The card is never sent anywhere; paying starts the trial on the
// server and keeps only the last four digits for the confirmation page.

const PROCESSING_MS = 1200

type Field = 'number' | 'expiry' | 'cvc' | 'name'
type Fields = Record<Field, string>

const EMPTY: Fields = { number: '', expiry: '', cvc: '', name: '' }

const MISSING: Record<Field, string> = {
  number: 'Enter a card number.',
  expiry: 'Enter the expiry date.',
  cvc: 'Enter the security code.',
  name: 'Enter the name on the card.',
}

const FORMAT: Record<Field, (value: string) => string> = {
  number: (value) =>
    value
      .replace(/\D/g, '')
      .slice(0, 19)
      .replace(/(\d{4})(?=\d)/g, '$1 '),
  expiry: (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 4)
    return digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits
  },
  cvc: (value) => value.replace(/\D/g, '').slice(0, 4),
  name: (value) => value.slice(0, 60),
}

export function CheckoutPage() {
  const router = useRouter()
  const params = useSearchParams()
  const planId = params.get('plan')
  const billingParam = params.get('billing')
  const billing = isBilling(billingParam) ? billingParam : 'yearly'
  const offer = OFFERS[billing]
  const trial = billing === 'trial'

  const [fields, setFields] = useState<Fields>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [paying, setPaying] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    if (!planId) router.replace('/app')
  }, [planId, router])

  if (!planId) return null

  const bind = (field: Field) => ({
    value: fields[field],
    error: errors[field],
    disabled: paying,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const value = FORMAT[field](event.target.value)
      setFields((prev) => ({ ...prev, [field]: value }))
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
    },
  })

  async function submit(event: FormEvent) {
    event.preventDefault()
    const missing: Partial<Record<Field, string>> = {}
    for (const field of Object.keys(EMPTY) as Field[]) {
      if (!fields[field].trim()) missing[field] = MISSING[field]
    }
    if (Object.keys(missing).length) {
      setErrors(missing)
      return
    }
    setPaying(true)
    setFailed(null)
    try {
      await Promise.all([
        api.startTrial({ plan: planFor(billing) }),
        new Promise((resolve) => setTimeout(resolve, PROCESSING_MS)),
      ])
      saveReceipt({ billing, last4: fields.number.replace(/\D/g, '').slice(-4) })
      router.push(`/paywall/success?plan=${planId}`)
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Something went wrong. Try again.')
      setPaying(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="hidden px-8 py-5 md:block">
        <Wordmark />
      </div>
      <div className="mx-auto flex w-full max-w-[624px] flex-1 flex-col gap-6 px-6 pt-6 pb-8 md:max-w-[996px] md:flex-none md:px-8 md:pt-4">
        <Link href={`/paywall?plan=${planId}`} className="-ml-2 inline-flex h-11 items-center gap-1 self-start rounded-xl px-2.5 text-base font-semibold text-text no-underline hover:bg-surface-2">
          <ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" />
          Back to plans
        </Link>

        <div className="flex flex-col gap-6 md:grid md:grid-cols-[460px_400px] md:justify-center md:gap-[72px]">
          <section className="stagger flex flex-col gap-4" aria-labelledby="order-title">
            <h1 id="order-title" className="q" style={{ fontSize: 26 }}>
              Order summary
            </h1>
            <div className="flex flex-col gap-1 rounded-[18px] bg-surface-2 px-5 py-4">
              <div className="flex items-baseline justify-between gap-3 text-[17px] font-bold">
                <span>{offer.summary}</span>
                <span>{trial ? '$0.00' : offer.dueToday}</span>
              </div>
              <p className="sm">
                {trial
                  ? `Then ${OFFERS.monthly.price}, starting ${nextChargeDate('trial')}`
                  : `Renews ${nextChargeDate(billing)}`}
              </p>
              <div className="my-2.5 border-t border-border" />
              <div className="flex items-baseline justify-between gap-3 text-[19px] font-extrabold">
                <span>Due today</span>
                <span>{offer.dueToday}</span>
              </div>
            </div>
            <p className="flex items-start gap-2.5 rounded-[16px] bg-sun-tint px-4 py-3.5 text-[15px] leading-snug text-sun-ink">
              <Info size={20} strokeWidth={2.2} aria-hidden="true" className="mt-px flex-none" />
              Demo checkout. No real payment is taken, so any card details work. Please don’t enter a real card.
            </p>
          </section>

          <form onSubmit={submit} noValidate autoComplete="off" className="a-rise flex flex-col gap-3" aria-labelledby="card-title">
            <h2 id="card-title" className="mb-1 text-2xl leading-tight font-extrabold tracking-[-0.02em]">
              Card details
            </h2>
            <TextField label="Card number" name="demo-number" inputMode="numeric" autoComplete="off" {...bind('number')} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="MM / YY" name="demo-expiry" inputMode="numeric" autoComplete="off" {...bind('expiry')} />
              <TextField label="CVC" name="demo-cvc" inputMode="numeric" autoComplete="off" {...bind('cvc')} />
            </div>
            <TextField label="Name on card" name="demo-name" autoComplete="off" {...bind('name')} />
            {failed && <StatusNote tone="error">{failed}</StatusNote>}
            <Button type="submit" variant="sun" block busy={paying} className="mt-2">
              {!paying && <Lock size={18} strokeWidth={2.4} aria-hidden="true" />}
              {paying ? 'Processing…' : trial ? 'Start free trial' : `Pay ${offer.dueToday}`}
            </Button>
            <p className="sm text-center">Cancel anytime.</p>
          </form>
        </div>
      </div>
    </main>
  )
}
