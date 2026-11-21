import "server-only";
import type { AdminAnalyticsResponse } from "@/contracts/api";
import { AI_WINDOW_DAYS, computeAnalytics } from "../analytics";
import { getEnv } from "./env";
import { getStore } from "./store";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The admin dashboard's numbers, counted from the store (lib/analytics.ts). */
export async function getAdminAnalytics(): Promise<AdminAnalyticsResponse> {
  const now = Date.now();
  const since = new Date(now - AI_WINDOW_DAYS * DAY_MS).toISOString();
  const rows = await getStore().analyticsRows(since);
  return computeAnalytics(rows, now, getEnv().DAILY_LLM_CALL_LIMIT);
}
