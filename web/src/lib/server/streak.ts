import "server-only";
import type { AuthUser } from "./auth";
import { ownedChild } from "./access";
import { getStore } from "./store";

// Enough for the longest streak the app shows (it walks back 800 days).
export const MAX_STREAK_DAYS = 800;
const TIME_ZONE_HEADER = "x-timezone";

/** The request's IANA time zone (X-Timezone), or UTC when missing or unknown. */
export function timeZoneOf(req: Request): string {
  const zone = req.headers.get(TIME_ZONE_HEADER)?.trim() ?? "";
  if (!zone || zone.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(zone)) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

/** YYYY-MM-DD of a moment in a time zone. */
export function localDay(timeZone: string, at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Counts today (in the child's time zone) as a streak day. */
export async function recordActivity(childId: string, timeZone: string): Promise<void> {
  await getStore().addActivityDay(childId, localDay(timeZone));
}

export async function getStreakDays(user: AuthUser, childId: string): Promise<string[]> {
  await ownedChild(user, childId);
  return getStore().listActivityDays(childId, MAX_STREAK_DAYS);
}
