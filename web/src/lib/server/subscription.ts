import "server-only";
import type { GetSubscriptionResponse } from "@/contracts/api";
import { TRIAL_DAYS, type BillingPlan, type Subscription } from "@/contracts/domain";
import { hasFullAccess } from "@/lib/access";
import type { AuthUser } from "./auth";
import { iso } from "./mappers";
import { getStore } from "./store";
import type { SubscriptionRow } from "./store/types";

const DAY_MS = 24 * 60 * 60 * 1000;

const toSubscription = (row: SubscriptionRow): Subscription => ({
  plan: row.plan,
  trialStartedAt: iso(row.trialStartedAt),
  trialEndsAt: iso(row.trialEndsAt),
  paidAt: row.paidAt ? iso(row.paidAt) : null,
});

/**
 * Starts the parent's free trial on the chosen plan. An account has one
 * trial: a second call returns the one already stored, plan included. No
 * payment is taken; paidAt is set by billing, which the app does not have yet.
 */
export async function startTrial(user: AuthUser, plan: BillingPlan): Promise<Subscription> {
  const trialEndsAtIso = new Date(Date.now() + TRIAL_DAYS * DAY_MS).toISOString();
  return toSubscription(await getStore().startTrial({ ownerId: user.id, plan, trialEndsAtIso }));
}

/** GET /subscription: the account's trial and payment state, if it has one. */
export async function getSubscription(user: AuthUser): Promise<GetSubscriptionResponse> {
  const row = await getStore().getSubscription(user.id);
  return { subscription: row && toSubscription(row) };
}

/** Whether the account opens every lesson: a running trial or a payment. */
export async function fullAccess(user: AuthUser): Promise<boolean> {
  return hasFullAccess(await getStore().getSubscription(user.id));
}
