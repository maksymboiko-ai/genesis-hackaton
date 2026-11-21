import { afterEach, describe, expect, it } from "vitest";
import { GET as analytics } from "@/app/api/admin/analytics/route";
import { GET as getLesson } from "@/app/api/lessons/[lessonId]/route";
import { POST as startTrial } from "@/app/api/subscription/route";
import { AdminAnalyticsResponse, StartTrialResponse } from "@/contracts/api";
import { GAP_CLOSED_FROM, TRIAL_DAYS } from "@/contracts/domain";
import { AI_WINDOW_DAYS, computeAnalytics } from "@/lib/analytics";
import { flushBackground } from "@/lib/server/background";
import { resetEnvForTests } from "@/lib/server/env";
import type { AnalyticsRows } from "@/lib/server/store/types";
import { answers, attempt, call, jsonRequest, memory, parent, readyCurriculum, signUpParent } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-21T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * DAY_MS).toISOString();

function admins(emails: string) {
  process.env.ADMIN_EMAILS = emails;
  resetEnvForTests();
}

afterEach(() => {
  delete process.env.ADMIN_EMAILS;
  resetEnvForTests();
});

const getAnalytics = (headers: Record<string, string> = {}) =>
  call(analytics, jsonRequest("GET", "/api/admin/analytics", undefined, headers));

const trial = (body: unknown, headers: Record<string, string> = {}) =>
  call(startTrial, jsonRequest("POST", "/api/subscription", body, headers));

/** Opens (generates) and answers a lesson. */
async function doLesson(lessonId: string, correct: number) {
  await call(getLesson, jsonRequest("GET", "/x"), { lessonId });
  await flushBackground();
  const res = await attempt(lessonId, { answers: answers(lessonId, correct) });
  expect(res.status).toBe(201);
}

const rows = (part: Partial<AnalyticsRows>): AnalyticsRows => ({
  children: [],
  curricula: [],
  lessons: [],
  attempts: [],
  replans: [],
  subscriptions: [],
  llmCalls: [],
  ...part,
});

const lesson = (part: Partial<AnalyticsRows["lessons"][number]>): AnalyticsRows["lessons"][number] => ({
  id: crypto.randomUUID(),
  curriculumId: "plan-1",
  kind: "core",
  contentStatus: "ready",
  completedAt: null,
  lastScore: null,
  ...part,
});

describe("GET /api/admin/analytics: who may read it", () => {
  it("needs a session", async () => {
    admins("parent@example.com");
    expect((await getAnalytics({ cookie: "" })).status).toBe(401);
  });

  it("answers not found to everyone when no admin is configured", async () => {
    const res = await getAnalytics();
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("answers not found to a signed-in parent who is not listed", async () => {
    admins("boss@example.com");
    expect((await getAnalytics()).status).toBe(404);
  });

  it("lets a listed account in, whatever the case or spacing in the list", async () => {
    admins(" Boss@Example.com , PARENT@example.com ");
    const res = await getAnalytics();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    AdminAnalyticsResponse.parse(res.body);
  });

  it("starts empty: rates are null, not zero", async () => {
    admins("parent@example.com");
    const body = AdminAnalyticsResponse.parse((await getAnalytics()).body);
    expect(body.gaps).toMatchObject({ rate: null, target: 0.6, closedFrom: 0.75, found: 0, tested: 0, closed: 0, bySubject: [] });
    expect(body.recovery).toMatchObject({ rate: null, target: 0.6, scheduled: 0, taken: 0, passed: 0 });
    expect(body.weekOne).toMatchObject({ rate: null, learners: 0 });
    expect(body.payment).toMatchObject({ paid: 0, paidTarget: 6, families: 0, familiesTarget: 30, trialToPaid: null, benchmark: 0.35 });
    expect(body.usage.averageScore).toBeNull();
    expect(body.ai.byDay).toHaveLength(AI_WINDOW_DAYS);
  });

  it("holds no name, prompt or email", async () => {
    admins("parent@example.com");
    await readyCurriculum();
    const text = JSON.stringify((await getAnalytics()).body);
    expect(text).not.toContain("Mia");
    expect(text).not.toContain("fractions for fifth grade");
    expect(text).not.toContain(parent.user.email);
  });
});

describe("gaps closed and recovery, end to end", () => {
  it("counts every gap found, closes one on a strong first try, and never on a retake", async () => {
    admins("parent@example.com");
    const { curriculum } = await readyCurriculum();
    for (const l of curriculum.lessons.slice(0, 3)) await doLesson(l.id, 0);
    await flushBackground();
    const remedial = memory().data.lessons.filter((l) => l.kind === "remedial");
    expect(remedial.length).toBeGreaterThanOrEqual(2);

    let body = AdminAnalyticsResponse.parse((await getAnalytics()).body);
    expect(body.gaps).toMatchObject({ rate: 0, found: remedial.length, tested: 0, closed: 0 });

    // First gap: every question right on the first try.
    await call(getLesson, jsonRequest("GET", "/x"), { lessonId: remedial[0].id });
    await flushBackground();
    const all = answers(remedial[0].id, 0).length;
    await doLesson(remedial[0].id, all);
    // Second gap: failed first, then a perfect retake of the same quiz.
    await doLesson(remedial[1].id, 0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await doLesson(remedial[1].id, answers(remedial[1].id, 0).length);

    body = AdminAnalyticsResponse.parse((await getAnalytics()).body);
    expect(body.gaps).toMatchObject({ found: remedial.length, tested: 2, closed: 1 });
    expect(body.gaps.rate).toBeCloseTo(1 / remedial.length);
    expect(body.gaps.bySubject).toHaveLength(1);
    expect(body.gaps.bySubject[0]).toMatchObject({ found: remedial.length, tested: 2, closed: 1 });
  });

  it("counts a retry only once the child takes it, and a pass from 60%", async () => {
    admins("parent@example.com");
    const { curriculum } = await readyCurriculum();
    // Three failed quizzes: the plan adds review lessons and a retry of each.
    for (const l of curriculum.lessons.slice(0, 3)) await doLesson(l.id, 0);
    await flushBackground();
    const retries = memory().data.lessons.filter((l) => l.kind === "retry");
    expect(retries).toHaveLength(3);

    let body = AdminAnalyticsResponse.parse((await getAnalytics()).body);
    expect(body.recovery).toMatchObject({ rate: null, scheduled: 3, taken: 0, passed: 0 });
    expect(body.usage.replans).toEqual({ struggling: 1, excelling: 0 });

    const questions = (id: string) => answers(id, 0).length;
    await doLesson(retries[0].id, 0);
    await call(getLesson, jsonRequest("GET", "/x"), { lessonId: retries[1].id });
    await flushBackground();
    await doLesson(retries[1].id, questions(retries[1].id));

    body = AdminAnalyticsResponse.parse((await getAnalytics()).body);
    expect(body.recovery).toMatchObject({ rate: 0.5, scheduled: 3, taken: 2, passed: 1 });
    expect(body.usage).toMatchObject({ parents: 1, learners: 1, activeLearners: 1, plans: 1, lessonsDone: 5 });
    expect(body.ai.calls).toBe(memory().data.llmCalls.length);
  });
});

describe("metric arithmetic", () => {
  it("gaps: closed at 3 of 4 on the first try, untested gaps stay open, subjects are split", () => {
    const gap = (id: string, curriculumId = "plan-1") => lesson({ id, curriculumId, kind: "remedial" });
    const tryAt = (lessonId: string, score: number, daysAgo: number) => ({ lessonId, score, createdAt: ago(daysAgo) });
    const out = computeAnalytics(
      rows({
        curricula: [
          { id: "plan-1", childId: "kid-1", subject: "Math" },
          { id: "plan-2", childId: "kid-2", subject: "Science" },
        ],
        lessons: [gap("three-of-four"), gap("two-of-four"), gap("retaken"), gap("untested"), gap("sci", "plan-2"), lesson({ id: "core" })],
        attempts: [
          // As Postgres returns 0.75 from a real column.
          tryAt("three-of-four", Math.fround(GAP_CLOSED_FROM) - 1e-8, 3),
          tryAt("two-of-four", 0.5, 3),
          tryAt("retaken", 1, 1),
          tryAt("retaken", 0.25, 2),
          tryAt("sci", 1, 1),
          tryAt("core", 1, 1),
        ],
      }),
      NOW,
      3000,
    );
    expect(out.gaps).toMatchObject({ rate: 0.4, target: 0.6, found: 5, tested: 4, closed: 2 });
    expect(out.gaps.bySubject).toEqual([
      { subject: "Math", found: 4, tested: 3, closed: 1, rate: 0.25 },
      { subject: "Science", found: 1, tested: 1, closed: 1, rate: 1 },
    ]);
  });

  it("recovery: pass mark is 0.6 and other lesson kinds are ignored", () => {
    const out = computeAnalytics(
      rows({
        curricula: [
          { id: "plan-1", childId: "kid-1", subject: "Math" },
          { id: "plan-2", childId: "kid-1", subject: "Science" },
        ],
        lessons: [
          lesson({ kind: "retry", completedAt: ago(1), lastScore: 0.6 }),
          lesson({ kind: "retry", completedAt: ago(1), lastScore: 0.59 }),
          lesson({ kind: "retry", completedAt: ago(1), lastScore: 1 }),
          lesson({ kind: "retry" }),
          lesson({ kind: "retry", curriculumId: "plan-2", completedAt: ago(1), lastScore: 0.2 }),
          lesson({ kind: "remedial", completedAt: ago(1), lastScore: 1 }),
          lesson({ kind: "core", completedAt: ago(1), lastScore: 0 }),
        ],
      }),
      NOW,
      3000,
    );
    expect(out.recovery).toEqual({ rate: 0.5, target: 0.6, scheduled: 5, taken: 4, passed: 2 });
  });

  it("week 1: three lessons inside the learner's first 7 days", () => {
    const done = (curriculumId: string, daysAgo: number) => lesson({ curriculumId, completedAt: ago(daysAgo), lastScore: 1 });
    const out = computeAnalytics(
      rows({
        children: [
          { id: "fast", ownerId: "p1", createdAt: ago(20) },
          { id: "late", ownerId: "p1", createdAt: ago(20) },
          { id: "new", ownerId: "p2", createdAt: ago(2) },
          { id: "idle", ownerId: null, createdAt: ago(30) },
        ],
        curricula: [
          { id: "plan-fast", childId: "fast", subject: "Math" },
          { id: "plan-late", childId: "late", subject: "Math" },
          { id: "plan-new", childId: "new", subject: "Math" },
        ],
        lessons: [
          done("plan-fast", 19), done("plan-fast", 18), done("plan-fast", 14),
          // Two in week 1, the third on day 8.
          done("plan-late", 19), done("plan-late", 18), done("plan-late", 12),
          done("plan-new", 1),
        ],
      }),
      NOW,
      3000,
    );
    expect(out.weekOne).toEqual({ rate: 0.25, lessonsTarget: 3, learners: 4, reached: 1, inFirstWeek: 1 });
    expect(out.usage).toMatchObject({ parents: 2, learners: 4, activeLearners: 1, lessonsDone: 7, averageScore: 1 });
  });

  it("payment: families paying against the pilot goal; only trials that are over convert", () => {
    const sub = (ownerId: string, startedDaysAgo: number, paidDaysAgo: number | null) => ({
      ownerId,
      plan: "yearly" as const,
      trialStartedAt: ago(startedDaysAgo),
      trialEndsAt: ago(startedDaysAgo - 7),
      paidAt: paidDaysAgo === null ? null : ago(paidDaysAgo),
    });
    const out = computeAnalytics(
      rows({
        children: [
          { id: "kid-1", ownerId: "ended-paid", createdAt: ago(30) },
          { id: "kid-2", ownerId: "ended-paid", createdAt: ago(30) },
          { id: "kid-3", ownerId: "running", createdAt: ago(2) },
        ],
        subscriptions: [
          sub("ended-paid", 30, 23),
          sub("ended-unpaid", 30, null),
          sub("ended-unpaid-2", 10, null),
          sub("paid-early", 3, 1),
          sub("running", 2, null),
        ],
      }),
      NOW,
      3000,
    );
    expect(out.payment).toEqual({
      paid: 2,
      paidTarget: 6,
      families: 2,
      familiesTarget: 30,
      trialsStarted: 5,
      trialsActive: 1,
      trialsOver: 4,
      trialToPaid: 0.5,
      benchmark: 0.35,
    });
  });

  it("AI: per task and model, per day, and against the daily limit", () => {
    const callAt = (daysAgo: number, task: "lesson" | "outline", latencyMs: number, ok = true) => ({
      task,
      model: task === "lesson" ? "m/fast" : "m/smart",
      latencyMs,
      inputTokens: ok ? 100 : null,
      outputTokens: ok ? 50 : null,
      ok,
      createdAt: ago(daysAgo),
    });
    const out = computeAnalytics(
      rows({
        llmCalls: [
          callAt(0.1, "lesson", 1000),
          callAt(0.2, "lesson", 3000),
          callAt(0.3, "lesson", 2000),
          callAt(2, "lesson", 9000, false),
          callAt(2, "outline", 500),
        ],
        lessons: [
          lesson({ contentStatus: "ready" }),
          lesson({ contentStatus: "failed" }),
          lesson({ contentStatus: "pending" }),
          lesson({ contentStatus: "generating" }),
        ],
      }),
      NOW,
      3000,
    );
    expect(out.ai).toMatchObject({
      windowDays: 30,
      calls: 5,
      failed: 1,
      inputTokens: 400,
      outputTokens: 200,
      callsLast24h: 3,
      dailyLimit: 3000,
      lessons: { ready: 1, failed: 1, waiting: 2 },
    });
    expect(out.ai.byTask).toEqual([
      { task: "lesson", model: "m/fast", calls: 4, failed: 1, medianLatencyMs: 2000, p95LatencyMs: 9000, inputTokens: 300, outputTokens: 150 },
      { task: "outline", model: "m/smart", calls: 1, failed: 0, medianLatencyMs: 500, p95LatencyMs: 500, inputTokens: 100, outputTokens: 50 },
    ]);
    expect(out.ai.byDay.at(-1)).toEqual({ day: "2026-11-21", calls: 3, failed: 0 });
    expect(out.ai.byDay.at(-3)).toEqual({ day: "2026-11-19", calls: 2, failed: 1 });
    expect(out.ai.byDay[0].day).toBe("2026-10-23");
    expect(out.ai.byDay.reduce((sum, d) => sum + d.calls, 0)).toBe(5);
  });
});

describe("POST /api/subscription", () => {
  it("starts a trial of TRIAL_DAYS on the chosen plan", async () => {
    const before = Date.now();
    const res = await trial({ plan: "monthly" });
    expect(res.status).toBe(201);
    const sub = StartTrialResponse.parse(res.body);
    expect(sub).toMatchObject({ plan: "monthly", paidAt: null });
    const length = Date.parse(sub.trialEndsAt) - Date.parse(sub.trialStartedAt);
    expect(Math.abs(length - TRIAL_DAYS * DAY_MS)).toBeLessThan(5000);
    expect(Date.parse(sub.trialStartedAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(memory().data.subscriptions).toEqual([expect.objectContaining({ ownerId: parent.user.id, plan: "monthly" })]);
  });

  it("keeps the first trial when asked again", async () => {
    const first = (await trial({ plan: "yearly" })).body;
    const again = await trial({ plan: "monthly" });
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first);
    expect(memory().data.subscriptions).toHaveLength(1);
  });

  it("is one per account", async () => {
    const other = await signUpParent("other-trial@example.com");
    await trial({ plan: "yearly" });
    await trial({ plan: "monthly" }, { cookie: other.cookie });
    expect(memory().data.subscriptions.map((s) => s.plan).sort()).toEqual(["monthly", "yearly"]);
  });

  it("rejects an unknown plan, a missing body and a request without a session", async () => {
    expect((await trial({ plan: "lifetime" })).status).toBe(400);
    expect((await trial({})).status).toBe(400);
    expect((await trial({ plan: "yearly" }, { cookie: "" })).status).toBe(401);
    expect(memory().data.subscriptions).toHaveLength(0);
  });

  it("shows up on the dashboard as a running trial", async () => {
    admins("parent@example.com");
    await trial({ plan: "yearly" });
    const body = AdminAnalyticsResponse.parse((await getAnalytics()).body);
    expect(body.payment).toMatchObject({ trialToPaid: null, trialsStarted: 1, trialsActive: 1, trialsOver: 0, paid: 0 });
  });
});
