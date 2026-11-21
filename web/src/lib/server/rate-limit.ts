import "server-only";
import { tooMany } from "./errors";

// In-memory token buckets. Per server instance, so on Vercel the real limit
// is per instance; good enough for an MVP demo, replace with a shared store
// before real traffic.
export type RateLimitRule = {
  name: string;
  // Burst size.
  capacity: number;
  // Tokens added per minute.
  perMinute: number;
};

type Bucket = { tokens: number; at: number };

const store = globalThis as unknown as { __rateBuckets?: Map<string, Bucket> };
const buckets = (store.__rateBuckets ??= new Map<string, Bucket>());
const MAX_KEYS = 10_000;

export function rateLimit(key: string, rule: RateLimitRule, now = Date.now()): void {
  const bucket = buckets.get(key) ?? { tokens: rule.capacity, at: now };
  const refill = ((now - bucket.at) / 60_000) * rule.perMinute;
  bucket.tokens = Math.min(rule.capacity, bucket.tokens + refill);
  bucket.at = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    throw tooMany();
  }
  bucket.tokens -= 1;
  if (buckets.size >= MAX_KEYS && !buckets.has(key)) buckets.clear();
  buckets.set(key, bucket);
}

export function resetRateLimitsForTests() {
  buckets.clear();
}

// Rules per route. Routes that start model calls are the strict ones.
export const LIMITS = {
  read: { name: "read", capacity: 240, perMinute: 240 },
  write: { name: "write", capacity: 60, perMinute: 60 },
  curriculum: { name: "curriculum", capacity: 10, perMinute: 2 },
  attempt: { name: "attempt", capacity: 30, perMinute: 30 },
  book: { name: "book", capacity: 5, perMinute: 1 },
} satisfies Record<string, RateLimitRule>;
