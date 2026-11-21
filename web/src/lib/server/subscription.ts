import "server-only";
import { TRIAL_DAYS, type BillingPlan, type Subscription } from "@/contracts/domain";
import type { AuthUser } from "./auth";
import { iso } from "./mappers";
import { getStore } from "./store";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Starts the parent's free trial on the chosen plan. An account has one
 * trial: a second call returns the one already stored, plan included. No
 * payment is taken; paidAt is set by billing, which the app does not have yet.
 */
export async function startTrial(user: AuthUser, plan: BillingPlan): Promise<Subscription> {
  const trialEndsAtIso = new Date(Date.now() + TRIAL_DAYS * DAY_MS).toISOString();
  const row = await getStore().startTrial({ ownerId: user.id, plan, trialEndsAtIso });
  return {
    plan: row.plan,
    trialStartedAt: iso(row.trialStartedAt),
    trialEndsAt: iso(row.trialEndsAt),
    paidAt: row.paidAt ? iso(row.paidAt) : null,
  };
}
