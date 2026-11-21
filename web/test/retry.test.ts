import { describe, expect, it } from "vitest";
import { POST as retry } from "@/app/api/lessons/[lessonId]/retry/route";
import { GET as getLesson } from "@/app/api/lessons/[lessonId]/route";
import { RetryLessonResponse } from "@/contracts/api";
import { fakeAi } from "@/lib/server/ai-fake";
import { flushBackground } from "@/lib/server/background";
import { call, jsonRequest, memory, readyCurriculum } from "./helpers";

const open = (lessonId: string) => call(getLesson, jsonRequest("GET", "/x"), { lessonId });
const tryAgain = (lessonId: string, ip = "1.1.1.1") =>
  call(retry, jsonRequest("POST", `/api/lessons/${lessonId}/retry`, undefined, { "x-forwarded-for": ip }), { lessonId });

async function failedLesson() {
  const { curriculum } = await readyCurriculum();
  const original = fakeAi.generateLesson;
  fakeAi.generateLesson = async () => {
    throw new Error("model down");
  };
  const log = console.error;
  console.error = () => {};
  const id = curriculum.lessons[2].id;
  try {
    await open(id);
    await flushBackground();
  } finally {
    fakeAi.generateLesson = original;
    console.error = log;
  }
  expect(memory().data.lessons.find((l) => l.id === id)!.contentStatus).toBe("failed");
  return id;
}

describe("POST /api/lessons/:id/retry", () => {
  it("Try again right after a failure regenerates at once (GET would wait for the cooldown)", async () => {
    const id = await failedLesson();
    expect((await open(id)).body.contentStatus).toBe("failed");

    const res = await tryAgain(id);
    expect(res.status).toBe(200);
    expect(RetryLessonResponse.parse(res.body).contentStatus).toBe("generating");
    await flushBackground();
    expect((await open(id)).body.contentStatus).toBe("ready");
  });

  it("a ready lesson is returned as it is, with no model call", async () => {
    const { curriculum } = await readyCurriculum();
    let calls = 0;
    const original = fakeAi.generateLesson;
    fakeAi.generateLesson = async (i) => {
      calls++;
      return original(i);
    };
    const res = await tryAgain(curriculum.lessons[0].id);
    await flushBackground();
    fakeAi.generateLesson = original;
    expect(res.body.contentStatus).toBe("ready");
    expect(JSON.stringify(res.body)).not.toMatch(/correctIndex|choiceFeedback|explanation/);
    expect(calls).toBe(0);
  });

  it("a lesson already generating is not started twice", async () => {
    const id = await failedLesson();
    await tryAgain(id);
    await tryAgain(id);
    const log = console.error;
    let calls = 0;
    const original = fakeAi.generateLesson;
    fakeAi.generateLesson = async (i) => {
      calls++;
      return original(i);
    };
    await flushBackground();
    fakeAi.generateLesson = original;
    console.error = log;
    expect(calls).toBeLessThanOrEqual(2); // the lesson, plus at most the prefetched next one
    expect(memory().data.lessons.find((l) => l.id === id)!.contentStatus).toBe("ready");
  });

  it("bad id → 400, unknown → 404, rate-limited", async () => {
    expect((await tryAgain("x")).status).toBe(400);
    expect((await tryAgain(crypto.randomUUID())).status).toBe(404);
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await tryAgain(crypto.randomUUID(), "9.9.9.9")).status);
    expect(statuses).toContain(429);
  });
});
