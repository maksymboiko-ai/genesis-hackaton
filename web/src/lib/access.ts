import { FREE_LESSONS_PER_PLAN } from "@/contracts/domain";

// Who may open which lesson. Pure, so the backend and the browser's mock API
// apply the same rule.

/** A running trial or a payment opens every lesson. */
export function hasFullAccess(
  subscription: { trialEndsAt: string; paidAt: string | null } | null,
  now = Date.now(),
): boolean {
  if (!subscription) return false;
  return subscription.paidAt !== null || Date.parse(subscription.trialEndsAt) > now;
}

/** Without full access only the first lessons of a plan are open. */
export function lessonLocked(position: number, fullAccess: boolean): boolean {
  return !fullAccess && position >= FREE_LESSONS_PER_PLAN;
}
