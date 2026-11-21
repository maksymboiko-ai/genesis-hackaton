import { describe, expect, it } from "vitest";
import { GET as getProfile } from "@/app/api/children/[childId]/profile/route";
import { SubmitAttemptResponse } from "@/contracts/api";
import { MASTERY_ALPHA, MASTERY_START } from "@/contracts/domain";
import { gradeAttempt, nextMastery, skillScores } from "@/lib/server/grading";
import { answers, attempt, call, jsonRequest, memory, readyCurriculum } from "./helpers";

describe("grading (pure)", () => {
  const content = {
    bodyMarkdown: "",
    questions: [
      { id: "a", prompt: "p", choices: ["1", "2", "3", "4"], correctIndex: 0, explanation: "e", skill: "s-one" },
      { id: "b", prompt: "p", choices: ["1", "2", "3", "4"], correctIndex: 1, explanation: "e", skill: "s-one" },
      { id: "c", prompt: "p", choices: ["1", "2", "3", "4"], correctIndex: 2, explanation: "e", skill: "s-two" },
    ],
  };

  it("scores 1 for all correct, 0 for none", () => {
    expect(gradeAttempt(content, [{ questionId: "a", chosenIndex: 0 }, { questionId: "b", chosenIndex: 1 }, { questionId: "c", chosenIndex: 2 }]).score).toBe(1);
    expect(gradeAttempt(content, [{ questionId: "a", chosenIndex: 3 }, { questionId: "b", chosenIndex: 3 }, { questionId: "c", chosenIndex: 3 }]).score).toBe(0);
  });

  it("rejects unknown, duplicate, missing and out-of-range answers", () => {
    const ok = [{ questionId: "a", chosenIndex: 0 }, { questionId: "b", chosenIndex: 1 }];
    expect(() => gradeAttempt(content, [...ok, { questionId: "x", chosenIndex: 0 }])).toThrow(/unknown/);
    expect(() => gradeAttempt(content, [...ok, { questionId: "a", chosenIndex: 0 }])).toThrow(/more than once/);
    expect(() => gradeAttempt(content, ok)).toThrow(/Every question/);
    expect(() => gradeAttempt(content, [...ok, { questionId: "c", chosenIndex: 4 }])).toThrow(/out of range/);
  });

  it("skill scores and the mastery formula use the contract constants", () => {
    const { results } = gradeAttempt(content, [{ questionId: "a", chosenIndex: 0 }, { questionId: "b", chosenIndex: 0 }, { questionId: "c", chosenIndex: 2 }]);
    expect(Object.fromEntries(skillScores(results))).toEqual({ "s-one": 0.5, "s-two": 1 });
    expect(nextMastery(undefined, 1)).toBeCloseTo((1 - MASTERY_ALPHA) * MASTERY_START + MASTERY_ALPHA);
    expect(nextMastery(undefined, 1)).toBeCloseTo(0.65);
    expect(nextMastery(0.65, 0)).toBeCloseTo(0.455);
  });
});

describe("POST /api/lessons/:id/attempts", () => {
  it("grades, completes the lesson, updates mastery and points at the next lesson", async () => {
    const { childId, curriculum } = await readyCurriculum();
    const lessonId = curriculum.lessons[0].id;
    const res = await attempt(lessonId, { answers: answers(lessonId, 3) });
    expect(res.status).toBe(201);
    const body = SubmitAttemptResponse.parse(res.body);
    expect(body.score).toBe(1);
    expect(body.results.every((r) => r.correct && r.explanation)).toBe(true);
    expect(body.nextLessonId).toBe(curriculum.lessons[1].id);
    expect(body.replanTriggered).toBeNull();

    const lesson = memory().data.lessons.find((l) => l.id === lessonId)!;
    expect(lesson.completedAt).not.toBeNull();
    expect(lesson.lastScore).toBe(1);

    const profile = await call(getProfile, jsonRequest("GET", "/x"), { childId });
    expect(profile.body.mastery).toHaveLength(1);
    expect(profile.body.mastery[0].mastery).toBeCloseTo(0.65);
  });

  it("a poor score still completes the lesson", async () => {
    const { curriculum } = await readyCurriculum();
    const lessonId = curriculum.lessons[0].id;
    const res = await attempt(lessonId, { answers: answers(lessonId, 0) });
    expect(res.body.score).toBe(0);
    expect(res.body.nextLessonId).toBe(curriculum.lessons[1].id);
  });

  it("lesson not ready → 409, unknown → 404, bad id → 400", async () => {
    const { curriculum } = await readyCurriculum();
    const pending = curriculum.lessons[3].id;
    const res = await attempt(pending, { answers: [{ questionId: "x", chosenIndex: 0 }] });
    expect(res.status).toBe(409);
    expect((await attempt(crypto.randomUUID(), { answers: [{ questionId: "x", chosenIndex: 0 }] })).status).toBe(404);
    expect((await attempt("nope", { answers: [{ questionId: "x", chosenIndex: 0 }] })).status).toBe(400);
  });

  it("rejects malformed answers without storing anything", async () => {
    const { curriculum } = await readyCurriculum();
    const lessonId = curriculum.lessons[0].id;
    const good = answers(lessonId, 1);
    for (const body of [
      { answers: [] },
      { answers: good.slice(1) },
      { answers: [...good, good[0]] },
      { answers: good.map((a, i) => (i === 0 ? { ...a, chosenIndex: 4 } : a)) },
      { answers: good.map((a, i) => (i === 0 ? { ...a, chosenIndex: -1 } : a)) },
      { answers: good.map((a, i) => (i === 0 ? { ...a, chosenIndex: 1.5 } : a)) },
      { answers: Array.from({ length: 11 }, (_, i) => ({ questionId: `q${i}`, chosenIndex: 0 })) },
      { answers: good.map((a, i) => (i === 0 ? { ...a, questionId: "x".repeat(101) } : a)) },
    ]) {
      expect((await attempt(lessonId, body)).status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    expect(memory().data.attempts).toHaveLength(0);
  });
});
