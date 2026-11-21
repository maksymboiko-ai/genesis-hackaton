import type { BillingPlan } from '@/contracts/domain'
import { PRICING } from '@/lib/config'

// The checkout is a demo: nothing is charged and no card data leaves the
// browser. Finishing it starts the account's trial on the server (POST
// /subscription); only the plan choice and the card's last four digits are
// kept, in sessionStorage, so the confirmation page can show them.

export const BILLINGS = ['yearly', 'monthly', 'trial'] as const
export type Billing = (typeof BILLINGS)[number]

/** The plan the account's subscription is recorded on; the trial rolls into monthly. */
export const planFor = (billing: Billing): BillingPlan => (billing === 'trial' ? 'monthly' : billing)

export const isBilling = (value: string | null): value is Billing =>
  value !== null && (BILLINGS as readonly string[]).includes(value)

type Offer = {
  label: string
  price: string
  summary: string
  dueToday: string
  badge?: string
}

export const OFFERS: Record<Billing, Offer> = {
  yearly: {
    label: 'Yearly',
    price: PRICING.yearly,
    summary: 'Mendly yearly',
    dueToday: PRICING.yearlyAmount,
    badge: PRICING.yearlySaving,
  },
  monthly: {
    label: 'Monthly',
    price: PRICING.monthly,
    summary: 'Mendly monthly',
    dueToday: PRICING.monthlyAmount,
  },
  trial: {
    label: `${PRICING.trialDays}-day free trial`,
    price: `$0 today, then ${PRICING.monthly}`,
    summary: `Mendly monthly · ${PRICING.trialDays}-day trial`,
    dueToday: '$0.00',
  },
}

/** When the first (trial) or next (paid) charge would happen. */
export function nextChargeDate(billing: Billing, from = new Date()) {
  const date = new Date(from)
  if (billing === 'yearly') date.setFullYear(date.getFullYear() + 1)
  else if (billing === 'monthly') date.setMonth(date.getMonth() + 1)
  else date.setDate(date.getDate() + PRICING.trialDays)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export type Receipt = { billing: Billing; last4: string }

const RECEIPT_KEY = 'mendly.checkout'

export function saveReceipt(receipt: Receipt) {
  try {
    sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt))
  } catch {}
}

export function readReceipt(): Receipt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(RECEIPT_KEY) ?? 'null') as Partial<Receipt> | null
    if (value && isBilling(value.billing ?? null) && typeof value.last4 === 'string') {
      return { billing: value.billing as Billing, last4: value.last4 }
    }
  } catch {}
  return null
}
