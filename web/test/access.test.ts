import { beforeEach, describe, expect, it } from "vitest";
import { GET as getCurriculum } from "@/app/api/curricula/[curriculumId]/route";
import { GET as getLesson } from "@/app/api/lessons/[lessonId]/route";
import { POST as retryLesson } from "@/app/api/lessons/[lessonId]/retry/route";
import { GET as getSubscription, POST as startTrial } from "@/app/api/subscription/route";
import { GetCurriculumResponse, GetLessonResponse, GetSubscriptionResponse } from "@/contracts/api";
import { flushBackground } from "@/lib/server/background";
import { answers, attempt, call, giveTrial, jsonRequest, memory, parent, readyCurriculum } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

const open = async (lessonId: string) => {
  const res = await call(getLesson, jsonRequest("GET", "/x"), { lessonId });
  await flushBackground();
  return res;
};
const plan = async (curriculumId: string) =>
  GetCurriculumResponse.parse((await call(getCurriculum, jsonRequest("GET", "/x"), { curriculumId })).body);
const statusOf = (lessonId: string) => memory().data.lessons.find((l) => l.id === lessonId)!.contentStatus;

// The test parent starts every other file on a trial; here it starts without one.
beforeEach(() => {
  memory().data.subscriptions.length = 0;
});

describe("lesson access without a trial", () => {
  it("opens the first lesson of a plan and locks the rest", async () => {
    const { curriculum } = await readyCurriculum();
    const lessons = (await plan(curriculum.id)).lessons;
    expect(lessons.map((l) => l.locked)).toEqual(lessons.map((_, i) => i > 0));

    const first = GetLessonResponse.parse((await open(lessons[0].id)).body);
    expect(first).toMatchObject({ locked: false, contentStatus: "ready" });
    expect(first.content).not.toBeNull();
    expect((await attempt(lessons[0].id, { answers: answers(lessons[0].id, 1) })).status).toBe(201);
  });

  it("answers a locked lesson without content and starts nothing", async () => {
    const { curriculum } = await readyCurriculum();
    const lessonId = curriculum.lessons[2].id;
    expect(statusOf(lessonId)).toBe("pending");
    const res = await open(lessonId);
    expect(res.status).toBe(200);
    expect(GetLessonResponse.parse(res.body)).toMatchObject({ locked: true, content: null });
    expect(statusOf(lessonId)).toBe("pending");
  });

  it("keeps the content of a locked lesson back even when it is already written", async () => {
    const { curriculum } = await readyCurriculum();
    const lessonId = curriculum.lessons[1].id;
    // Written while the account still had access.
    giveTrial(parent.user.id);
    await open(lessonId);
    expect(statusOf(lessonId)).toBe("ready");
    memory().data.subscriptions.length = 0;

    expect(GetLessonResponse.parse((await open(lessonId)).body)).toMatchObject({ locked: true, content: null });
  });

  it("refuses a quiz submission and a retry on a locked lesson with 402", async () => {
    const { curriculum } = await readyCurriculum();
    const lessonId = curriculum.lessons[1].id;
    giveTrial(parent.user.id);
    await open(lessonId);
    const body = { answers: answers(lessonId, 1) };
    memory().data.subscriptions.length = 0;

    const submitted = await attempt(lessonId, body);
    expect(submitted.status).toBe(402);
    expect(submitted.body.error.code).toBe("payment_required");
    expect(memory().data.attempts).toHaveLength(0);

    const retried = await call(retryLesson, jsonRequest("POST", "/x"), { lessonId });
    expect(retried.status).toBe(402);
  });
});

describe("lesson access with a trial", () => {
  it("opens every lesson once the trial starts", async () => {
    const { curriculum } = await readyCurriculum();
    const started = await call(startTrial, jsonRequest("POST", "/api/subscription", { plan: "yearly" }));
    expect(started.status).toBe(201);

    expect((await plan(curriculum.id)).lessons.some((l) => l.locked)).toBe(false);
    const lessonId = curriculum.lessons[2].id;
    expect(GetLessonResponse.parse((await open(lessonId)).body).locked).toBe(false);
    expect(statusOf(lessonId)).toBe("ready");
    expect((await attempt(lessonId, { answers: answers(lessonId, 1) })).status).toBe(201);
  });

  it("locks the lessons again when the trial ends without a payment", async () => {
    const { curriculum } = await readyCurriculum();
    giveTrial(parent.user.id, -1);
    expect((await plan(curriculum.id)).lessons.map((l) => l.locked)).toEqual(curriculum.lessons.map((_, i) => i > 0));

    // The one trial is spent: asking again does not start another.
    await call(startTrial, jsonRequest("POST", "/api/subscription", { plan: "monthly" }));
    expect(memory().data.subscriptions).toHaveLength(1);
    expect(GetLessonResponse.parse((await open(curriculum.lessons[1].id)).body).locked).toBe(true);
  });

  it("keeps a paid account open after the trial dates", async () => {
    const { curriculum } = await readyCurriculum();
    giveTrial(parent.user.id, -30);
    memory().data.subscriptions[0].paidAt = new Date(Date.now() - 20 * DAY_MS).toISOString();
    expect((await plan(curriculum.id)).lessons.some((l) => l.locked)).toBe(false);
  });
});

describe("GET /api/subscription", () => {
  const get = (headers: Record<string, string> = {}) =>
    call(getSubscription, jsonRequest("GET", "/api/subscription", undefined, headers));

  it("is null before a trial and the trial after", async () => {
    expect(GetSubscriptionResponse.parse((await get()).body)).toEqual({ subscription: null });
    const started = (await call(startTrial, jsonRequest("POST", "/api/subscription", { plan: "monthly" }))).body;
    expect(GetSubscriptionResponse.parse((await get()).body)).toEqual({ subscription: started });
  });

  it("needs a session", async () => {
    expect((await get({ cookie: "" })).status).toBe(401);
  });
});
