import { describe, expect, it } from "vitest";
import { GET as getCurriculum } from "@/app/api/curricula/[curriculumId]/route";
import { GET as getLesson } from "@/app/api/lessons/[lessonId]/route";
import { GetCurriculumResponse } from "@/contracts/api";
import { EXCELLING_FROM, REPLAN_WINDOW, STRUGGLING_BELOW } from "@/contracts/domain";
import { fakeAi } from "@/lib/server/ai-fake";
import { flushBackground } from "@/lib/server/background";
import { decideReplan, MAX_REPLAN_LESSONS, planReplan } from "@/lib/server/replan-plan";
import type { LessonRow } from "@/lib/server/store/types";
import { answers, attempt, call, jsonRequest, memory, readyCurriculum } from "./helpers";

const quiet = async <T>(fn: () => Promise<T>) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

/** Opens (generates) and answers the lesson at `position`. */
async function doLesson(curriculumId: string, position: number, correct: number) {
  const lesson = memory().data.lessons.filter((l) => l.curriculumId === curriculumId).find((l) => l.position === position)!;
  await call(getLesson, jsonRequest("GET", "/x"), { lessonId: lesson.id });
  await flushBackground();
  const res = await attempt(lesson.id, { answers: answers(lesson.id, correct) });
  expect(res.status).toBe(201);
  return res.body;
}

const curriculumOf = async (id: string) =>
  GetCurriculumResponse.parse((await call(getCurriculum, jsonRequest("GET", "/x"), { curriculumId: id })).body);

describe("replan rule (pure)", () => {
  it("needs a full window", () => {
    expect(decideReplan([0, 0])).toBeNull();
    expect(REPLAN_WINDOW).toBe(3);
  });
  it("uses the contract thresholds", () => {
    expect(decideReplan([0.5, 0.6, 0.67])).toBe("struggling"); // mean 0.59
    expect(decideReplan([0.6, 0.6, 0.6])).toBeNull();
    expect(decideReplan([0.9, 0.9, 0.9])).toBe("excelling");
    expect(decideReplan([1, 1, 0.67])).toBeNull(); // mean 0.89
    expect(STRUGGLING_BELOW).toBe(0.6);
    expect(EXCELLING_FROM).toBe(0.9);
  });
  it("only the newest window counts", () => {
    expect(decideReplan([1, 1, 1, 0, 0, 0])).toBe("excelling");
  });
});

describe("replan placement (pure)", () => {
  const lesson = (position: number, over: Partial<LessonRow> = {}): LessonRow => ({
    id: `l${position}`,
    curriculumId: "c",
    position,
    kind: "core",
    title: `L${position}`,
    objective: "o",
    skills: ["s"],
    retryOfLessonId: null,
    contentStatus: "ready",
    content: null,
    completedAt: null,
    lastScore: null,
    bookSectionIndex: position,
    generationStartedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  });
  const done = { completedAt: "2026-01-01T00:00:00Z" };
  const lessons = [lesson(0, done), lesson(1, done), lesson(2, done), lesson(3), lesson(4)];

  it("struggling: remedial then retries of failed lessons, before the next unfinished lesson", () => {
    const plan = planReplan({
      trigger: "struggling",
      lessons,
      windowAttempts: [
        { lessonId: "l2", score: 0.3 },
        { lessonId: "l1", score: 0.9 },
        { lessonId: "l0", score: 0.2 },
      ],
      proposed: [{ title: "Review", objective: "r", skills: ["Missing Skill"] }],
    });
    expect(plan.insertAt).toBe(3);
    expect(plan.rows.map((r) => [r.kind, r.title, r.retryOfLessonId, r.bookSectionIndex])).toEqual([
      ["remedial", "Review", null, null],
      ["retry", "L0", "l0", 0],
      ["retry", "L2", "l2", 2],
    ]);
    expect(plan.rows[0].skills).toEqual(["missing-skill"]);
  });

  it("excelling: extensions appended at the end, capped", () => {
    const proposed = Array.from({ length: 10 }, (_, i) => ({ title: `E${i}`, objective: "e", skills: ["x"] }));
    const plan = planReplan({ trigger: "excelling", lessons, windowAttempts: [], proposed });
    expect(plan.insertAt).toBe(5);
    expect(plan.rows).toHaveLength(MAX_REPLAN_LESSONS);
    expect(plan.rows.every((r) => r.kind === "extension")).toBe(true);
  });

  it("all lessons done: struggling inserts at the end", () => {
    const all = lessons.map((l) => ({ ...l, ...done }));
    expect(planReplan({ trigger: "struggling", lessons: all, windowAttempts: [], proposed: [] }).insertAt).toBe(5);
  });
});

describe("self-healing end to end", () => {
  it("three poor attempts → struggling replan inserts remedial + retry lessons and a diagnosis", async () => {
    const { curriculum } = await readyCurriculum();
    const r1 = await doLesson(curriculum.id, 0, 1);
    const r2 = await doLesson(curriculum.id, 1, 0);
    expect(r1.replanTriggered).toBeNull();
    expect(r2.replanTriggered).toBeNull();
    const r3 = await doLesson(curriculum.id, 2, 1);
    expect(r3.replanTriggered).toBe("struggling");
    expect((await curriculumOf(curriculum.id)).replanStatus).toBe("running");

    await flushBackground();
    const after = await curriculumOf(curriculum.id);
    expect(after.replanStatus).toBe("idle");
    expect(after.lessons.map((l) => l.position)).toEqual(after.lessons.map((_, i) => i));
    const kinds = after.lessons.map((l) => l.kind);
    expect(kinds.slice(0, 3)).toEqual(["core", "core", "core"]);
    expect(kinds).toContain("remedial");
    expect(kinds.filter((k) => k === "retry")).toHaveLength(3);
    expect(kinds[kinds.length - 1]).toBe("core");
    expect(after.replanEvents).toHaveLength(1);
    expect(after.replanEvents[0].trigger).toBe("struggling");
    expect(after.replanEvents[0].diagnosis.missingSkills.length).toBeGreaterThan(0);
    // The first new lesson is generated ahead of time.
    const firstNew = after.lessons.find((l) => l.id === after.replanEvents[0].insertedLessonIds[0])!;
    expect(firstNew.contentStatus).toBe("ready");
  });

  it("three perfect attempts → an extension is appended", async () => {
    const { curriculum } = await readyCurriculum();
    for (const p of [0, 1, 2]) await doLesson(curriculum.id, p, 3);
    await flushBackground();
    const after = await curriculumOf(curriculum.id);
    expect(after.lessons[after.lessons.length - 1].kind).toBe("extension");
    expect(after.replanEvents[0].trigger).toBe("excelling");
  });

  it("the window restarts after a replan", async () => {
    const { curriculum } = await readyCurriculum();
    for (const p of [0, 1, 2]) await doLesson(curriculum.id, p, 3);
    await flushBackground();
    await new Promise((r) => setTimeout(r, 5));
    const next = await doLesson(curriculum.id, 3, 3);
    expect(next.replanTriggered).toBeNull();
  });

  it("only one replan runs even with parallel triggering attempts", async () => {
    const { curriculum } = await readyCurriculum();
    await doLesson(curriculum.id, 0, 3);
    await doLesson(curriculum.id, 1, 3);
    // Two lessons ready, answered at the same time.
    const l2 = memory().data.lessons.find((l) => l.curriculumId === curriculum.id && l.position === 2)!;
    const l3 = memory().data.lessons.find((l) => l.curriculumId === curriculum.id && l.position === 3)!;
    await call(getLesson, jsonRequest("GET", "/x"), { lessonId: l2.id });
    await call(getLesson, jsonRequest("GET", "/x"), { lessonId: l3.id });
    await flushBackground();
    let calls = 0;
    const original = fakeAi.replan;
    fakeAi.replan = async (input) => {
      calls++;
      return original(input);
    };
    const results = await Promise.all([
      attempt(l2.id, { answers: answers(l2.id, 3) }),
      attempt(l3.id, { answers: answers(l3.id, 3) }),
    ]);
    await flushBackground();
    fakeAi.replan = original;
    expect(results.filter((r) => r.body.replanTriggered === "excelling").length).toBe(1);
    expect(calls).toBe(1);
    expect((await curriculumOf(curriculum.id)).replanEvents).toHaveLength(1);
  });

  it("a failed replan leaves the lessons untouched and the curriculum idle", () =>
    quiet(async () => {
      const { curriculum } = await readyCurriculum();
      const before = (await curriculumOf(curriculum.id)).lessons.length;
      const original = fakeAi.replan;
      fakeAi.replan = async () => {
        throw new Error("model down");
      };
      try {
        for (const p of [0, 1, 2]) await doLesson(curriculum.id, p, 0);
        await flushBackground();
      } finally {
        fakeAi.replan = original;
      }
      const after = await curriculumOf(curriculum.id);
      expect(after.replanStatus).toBe("idle");
      expect(after.lessons).toHaveLength(before);
      expect(after.replanEvents).toHaveLength(0);
    }));

  it("model output is bounded: too many lessons, bad slugs", async () => {
    const { curriculum } = await readyCurriculum();
    const original = fakeAi.replan;
    fakeAi.replan = async () => ({
      diagnosis: { summary: "s", mistakes: [], missingSkills: ["Bad Slug"] },
      newLessons: Array.from({ length: 20 }, (_, i) => ({ title: `R${i}`, objective: "r", skills: ["NOT OK"] })),
    });
    try {
      for (const p of [0, 1, 2]) await doLesson(curriculum.id, p, 0);
      await flushBackground();
    } finally {
      fakeAi.replan = original;
    }
    const after = await curriculumOf(curriculum.id);
    expect(after.lessons.filter((l) => l.kind === "remedial")).toHaveLength(MAX_REPLAN_LESSONS);
    expect(after.replanEvents[0].diagnosis.missingSkills).toEqual(["bad-slug"]);
  });

  it("learner notes are refreshed after attempts, capped and without the child's name", async () => {
    const { childId, curriculum } = await readyCurriculum();
    await doLesson(curriculum.id, 0, 2);
    await flushBackground();
    const child = memory().data.children.find((c) => c.id === childId)!;
    expect(child.notes).toMatch(/Grade 5 learner/);

    const original = fakeAi.updateLearnerNotes;
    let seen = "";
    fakeAi.updateLearnerNotes = async (input) => {
      seen = JSON.stringify(input);
      return { notes: "x".repeat(10_000) };
    };
    await doLesson(curriculum.id, 1, 2);
    await flushBackground();
    fakeAi.updateLearnerNotes = original;
    expect(child.notes.length).toBeLessThanOrEqual(2000);
    expect(memory().data.children[0].notes.length).toBe(2000);
    expect(seen).not.toContain("Mia");
    expect(seen).toContain("wrongAnswers");
  });
});
