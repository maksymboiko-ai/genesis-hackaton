import "server-only";
import type { AdminAnalyticsResponse } from "@/contracts/api";
import {
  GAP_CLOSE_TARGET,
  GAP_CLOSED_FROM,
  PILOT_FAMILIES,
  PILOT_PAID_FAMILIES_TARGET,
  RECOVERY_TARGET,
  STRUGGLING_BELOW,
  TRIAL_TO_PAID_BENCHMARK,
  WEEK_ONE_LESSONS,
} from "@/contracts/domain";
import { getEnv } from "./env";
import { getStore } from "./store";
import type { AnalyticsRows } from "./store/types";

// The admin dashboard's numbers, counted from the product tables. Pure
// arithmetic over AnalyticsRows; definitions are in ARCHITECTURE.md.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
// How far back model calls are read.
export const AI_WINDOW_DAYS = 30;

const rate = (part: number, whole: number) => (whole === 0 ? null : part / whole);
const utcDay = (at: number | string) => new Date(at).toISOString().slice(0, 10);

/** Nearest-rank percentile of an ascending list; 0 for an empty one. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

// Scores are stored in a 4-byte column (0.75 can come back as 0.7499999);
// compare them at this precision.
const atLeast = (score: number, mark: number) => score >= mark - 1e-6;

/**
 * The key metric. Each remedial lesson is one gap found; it is closed when
 * the child's first try at its quiz reaches GAP_CLOSED_FROM. A later retake
 * of the same questions does not count.
 */
function gaps(rows: AnalyticsRows): AdminAnalyticsResponse["gaps"] {
  const subjectOf = new Map(rows.curricula.map((c) => [c.id, c.subject]));
  const firstTry = new Map<string, { score: number; at: string }>();
  for (const attempt of rows.attempts) {
    const first = firstTry.get(attempt.lessonId);
    if (!first || attempt.createdAt < first.at) firstTry.set(attempt.lessonId, { score: attempt.score, at: attempt.createdAt });
  }

  const bySubject = new Map<string, { found: number; tested: number; closed: number }>();
  const total = { found: 0, tested: 0, closed: 0 };
  for (const lesson of rows.lessons) {
    if (lesson.kind !== "remedial") continue;
    const subject = subjectOf.get(lesson.curriculumId) ?? "Other";
    const group = bySubject.get(subject) ?? { found: 0, tested: 0, closed: 0 };
    bySubject.set(subject, group);
    const first = firstTry.get(lesson.id);
    for (const count of [group, total]) {
      count.found += 1;
      if (first) count.tested += 1;
      if (first && atLeast(first.score, GAP_CLOSED_FROM)) count.closed += 1;
    }
  }
  return {
    rate: rate(total.closed, total.found),
    target: GAP_CLOSE_TARGET,
    ...total,
    closedFrom: GAP_CLOSED_FROM,
    bySubject: [...bySubject.entries()]
      .map(([subject, g]) => ({ subject, ...g, rate: rate(g.closed, g.found) }))
      .sort((a, b) => b.found - a.found || a.subject.localeCompare(b.subject)),
  };
}

function recovery(rows: AnalyticsRows): AdminAnalyticsResponse["recovery"] {
  const retries = rows.lessons.filter((l) => l.kind === "retry");
  const taken = retries.filter((l) => l.completedAt && l.lastScore !== null);
  const passed = taken.filter((l) => atLeast(l.lastScore!, STRUGGLING_BELOW)).length;
  return {
    rate: rate(passed, taken.length),
    target: RECOVERY_TARGET,
    scheduled: retries.length,
    taken: taken.length,
    passed,
  };
}

/** Lesson completion times per child. */
function completionsByChild(rows: AnalyticsRows): Map<string, number[]> {
  const childOf = new Map(rows.curricula.map((c) => [c.id, c.childId]));
  const done = new Map<string, number[]>();
  for (const lesson of rows.lessons) {
    const childId = childOf.get(lesson.curriculumId);
    if (!childId || !lesson.completedAt) continue;
    done.set(childId, [...(done.get(childId) ?? []), Date.parse(lesson.completedAt)]);
  }
  return done;
}

function weekOne(rows: AnalyticsRows, done: Map<string, number[]>, now: number): AdminAnalyticsResponse["weekOne"] {
  let reached = 0;
  let inFirstWeek = 0;
  for (const child of rows.children) {
    const added = Date.parse(child.createdAt);
    const early = (done.get(child.id) ?? []).filter((at) => at < added + WEEK_MS).length;
    if (early >= WEEK_ONE_LESSONS) reached += 1;
    else if (now < added + WEEK_MS) inFirstWeek += 1;
  }
  return {
    rate: rate(reached, rows.children.length),
    lessonsTarget: WEEK_ONE_LESSONS,
    learners: rows.children.length,
    reached,
    inFirstWeek,
  };
}

/** Parent accounts with at least one learner. */
const familiesOf = (rows: AnalyticsRows) => new Set(rows.children.map((c) => c.ownerId).filter(Boolean)).size;

function payment(rows: AnalyticsRows, now: number): AdminAnalyticsResponse["payment"] {
  const paid = rows.subscriptions.filter((s) => s.paidAt !== null).length;
  // A trial is over once it was paid or its last day has passed.
  const over = rows.subscriptions.filter((s) => s.paidAt !== null || Date.parse(s.trialEndsAt) <= now).length;
  return {
    paid,
    paidTarget: PILOT_PAID_FAMILIES_TARGET,
    families: familiesOf(rows),
    familiesTarget: PILOT_FAMILIES,
    trialsStarted: rows.subscriptions.length,
    trialsActive: rows.subscriptions.length - over,
    trialsOver: over,
    trialToPaid: rate(paid, over),
    benchmark: TRIAL_TO_PAID_BENCHMARK,
  };
}

function usage(rows: AnalyticsRows, done: Map<string, number[]>, now: number): AdminAnalyticsResponse["usage"] {
  const scores = rows.lessons.filter((l) => l.completedAt && l.lastScore !== null).map((l) => l.lastScore!);
  return {
    parents: familiesOf(rows),
    learners: rows.children.length,
    activeLearners: [...done.values()].filter((times) => times.some((at) => at > now - WEEK_MS)).length,
    plans: rows.curricula.length,
    lessonsDone: rows.lessons.filter((l) => l.completedAt).length,
    // Scores come from a 4-byte column; keep the mean inside 0..1.
    averageScore: scores.length ? Math.min(1, scores.reduce((sum, s) => sum + s, 0) / scores.length) : null,
    replans: {
      struggling: rows.replans.filter((r) => r.trigger === "struggling").length,
      excelling: rows.replans.filter((r) => r.trigger === "excelling").length,
    },
  };
}

function ai(rows: AnalyticsRows, now: number, dailyLimit: number): AdminAnalyticsResponse["ai"] {
  const calls = rows.llmCalls;
  const tokens = (pick: (c: AnalyticsRows["llmCalls"][number]) => number | null, list = calls) =>
    list.reduce((sum, c) => sum + (pick(c) ?? 0), 0);

  const groups = new Map<string, AnalyticsRows["llmCalls"]>();
  for (const call of calls) {
    const key = `${call.task}\n${call.model}`;
    groups.set(key, [...(groups.get(key) ?? []), call]);
  }
  const byTask = [...groups.values()]
    .map((group) => {
      const latencies = group.map((c) => c.latencyMs).sort((a, b) => a - b);
      return {
        task: group[0].task,
        model: group[0].model,
        calls: group.length,
        failed: group.filter((c) => !c.ok).length,
        medianLatencyMs: Math.round(percentile(latencies, 0.5)),
        p95LatencyMs: Math.round(percentile(latencies, 0.95)),
        inputTokens: tokens((c) => c.inputTokens, group),
        outputTokens: tokens((c) => c.outputTokens, group),
      };
    })
    .sort((a, b) => b.calls - a.calls || a.task.localeCompare(b.task) || a.model.localeCompare(b.model));

  const days = new Map<string, { calls: number; failed: number }>();
  for (let i = AI_WINDOW_DAYS - 1; i >= 0; i--) days.set(utcDay(now - i * DAY_MS), { calls: 0, failed: 0 });
  for (const call of calls) {
    const day = days.get(utcDay(call.createdAt));
    if (!day) continue;
    day.calls += 1;
    if (!call.ok) day.failed += 1;
  }

  return {
    windowDays: AI_WINDOW_DAYS,
    calls: calls.length,
    failed: calls.filter((c) => !c.ok).length,
    inputTokens: tokens((c) => c.inputTokens),
    outputTokens: tokens((c) => c.outputTokens),
    callsLast24h: calls.filter((c) => Date.parse(c.createdAt) > now - DAY_MS).length,
    dailyLimit,
    byTask,
    byDay: [...days.entries()].map(([day, d]) => ({ day, ...d })),
    lessons: {
      ready: rows.lessons.filter((l) => l.contentStatus === "ready").length,
      failed: rows.lessons.filter((l) => l.contentStatus === "failed").length,
      waiting: rows.lessons.filter((l) => l.contentStatus === "pending" || l.contentStatus === "generating").length,
    },
  };
}

export function computeAnalytics(rows: AnalyticsRows, now: number, dailyLimit: number): AdminAnalyticsResponse {
  const done = completionsByChild(rows);
  return {
    generatedAt: new Date(now).toISOString(),
    gaps: gaps(rows),
    recovery: recovery(rows),
    weekOne: weekOne(rows, done, now),
    payment: payment(rows, now),
    usage: usage(rows, done, now),
    ai: ai(rows, now, dailyLimit),
  };
}

export async function getAdminAnalytics(): Promise<AdminAnalyticsResponse> {
  const now = Date.now();
  const since = new Date(now - AI_WINDOW_DAYS * DAY_MS).toISOString();
  const rows = await getStore().analyticsRows(since);
  return computeAnalytics(rows, now, getEnv().DAILY_LLM_CALL_LIMIT);
}
