import { describe, expect, it } from "vitest";
import { POST as extend } from "@/app/api/curricula/[curriculumId]/extend/route";
import { ExtendCurriculumResponse } from "@/contracts/api";
import { MAX_CURRICULUM_LESSONS, MAX_EXTEND_LESSONS } from "@/contracts/domain";
import type { ExtendOutlineInput } from "@/contracts/ai";
import { fakeAi } from "@/lib/server/ai-fake";
import { flushBackground } from "@/lib/server/background";
import { answers, attempt, call, jsonRequest, memory, parent, readyCurriculum, signUpParent } from "./helpers";

const keepGoing = (curriculumId: string, headers: Record<string, string> = {}) =>
  call(extend, jsonRequest("POST", `/api/curricula/${curriculumId}/extend`, undefined, headers), { curriculumId });

/** Marks every lesson of the plan done without going through the quiz. */
function finishAll(curriculumId: string, score = 0.8) {
  for (const lesson of memory().data.lessons.filter((l) => l.curriculumId === curriculumId)) {
    lesson.completedAt ??= new Date().toISOString();
    lesson.lastScore ??= score;
  }
}

const quiet = async <T>(fn: () => Promise<T>) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

describe("POST /api/curricula/:id/extend", () => {
  it("adds lessons after the last one and starts writing the first", async () => {
    const { curriculum } = await readyCurriculum();
    finishAll(curriculum.id);
    const res = await keepGoing(curriculum.id);
    expect(res.status).toBe(201);
    const plan = ExtendCurriculumResponse.parse(res.body);
    expect(plan.lessons.map((l) => l.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const added = plan.lessons.slice(4);
    expect(added.every((l) => l.kind === "core" && l.completedAt === null)).toBe(true);
    expect(added.map((l) => l.contentStatus)).toEqual(["generating", "pending", "pending"]);
    expect(plan.replanStatus).toBe("idle");
    expect(plan.replanEvents).toEqual([]);

    await flushBackground();
    expect(memory().data.lessons.find((l) => l.id === added[0].id)!.contentStatus).toBe("ready");
  });

  it("plans from the whole plan so far: every lesson with its result, and the learner", async () => {
    const { curriculum } = await readyCurriculum();
    // Finish lesson 1 through the quiz, the rest directly.
    await attempt(curriculum.lessons[0].id, { answers: answers(curriculum.lessons[0].id, 1) });
    await flushBackground();
    finishAll(curriculum.id, 1);

    let seen: ExtendOutlineInput | undefined;
    const original = fakeAi.extendOutline;
    fakeAi.extendOutline = async (input) => {
      seen = input;
      return original(input);
    };
    const res = await keepGoing(curriculum.id);
    fakeAi.extendOutline = original;
    expect(res.status).toBe(201);
    expect(seen!.prompt).toBe("fractions for fifth grade");
    expect(seen!.lessons).toHaveLength(4);
    expect(seen!.lessons[0]).toMatchObject({ title: "Foundations", kind: "core", bookSectionIndex: null });
    expect(seen!.lessons[0].score).toBeCloseTo(1 / 3);
    expect(seen!.lessons[1].score).toBe(1);
    expect(seen!.learner.gradeLevel).toBe(5);
    expect(seen!.knownSkills.length).toBeGreaterThan(0);
    expect(seen!.maxLessons).toBe(MAX_EXTEND_LESSONS);
  });

  it("can be used again once the new lessons are done, without repeating titles", async () => {
    const { curriculum } = await readyCurriculum();
    finishAll(curriculum.id);
    expect((await keepGoing(curriculum.id)).status).toBe(201);
    await flushBackground();
    finishAll(curriculum.id);
    const second = await keepGoing(curriculum.id);
    expect(second.status).toBe(201);
    const titles = second.body.lessons.map((l: { title: string }) => l.title);
    expect(titles).toHaveLength(10);
    expect(new Set(titles).size).toBe(10);
  });

  it("refuses while a lesson is unfinished, and leaves the plan as it was", async () => {
    const { curriculum } = await readyCurriculum();
    const res = await keepGoing(curriculum.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
    expect(memory().data.lessons).toHaveLength(4);
    expect(memory().data.curricula[0].replanStatus).toBe("idle");
  });

  it("two presses at once add one batch", async () => {
    const { curriculum } = await readyCurriculum();
    finishAll(curriculum.id);
    const results = await Promise.all([1, 2, 3, 4].map((n) => keepGoing(curriculum.id, { "x-forwarded-for": `2.2.2.${n}` })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    expect(memory().data.lessons).toHaveLength(7);
  });

  it("refuses while a replan is running", async () => {
    const { curriculum } = await readyCurriculum();
    finishAll(curriculum.id);
    const row = memory().data.curricula[0];
    row.replanStatus = "running";
    row.replanStartedAt = new Date().toISOString();
    expect((await keepGoing(curriculum.id)).status).toBe(409);
    expect(row.replanStatus).toBe("running");
  });

  it("a failed model call adds nothing and frees the plan", () => quiet(async () => {
    const { curriculum } = await readyCurriculum();
    finishAll(curriculum.id);
    const original = fakeAi.extendOutline;
    fakeAi.extendOutline = async () => {
      throw new Error("model down");
    };
    const failed = await keepGoing(curriculum.id);
    fakeAi.extendOutline = original;
    expect(failed.status).toBe(502);
    expect(memory().data.lessons).toHaveLength(4);
    expect(memory().data.curricula[0].replanStatus).toBe("idle");
    expect((await keepGoing(curriculum.id)).status).toBe(201);
  }));

  it("treats model output as untrusted: repeats dropped, batch capped, slugs cleaned", () => quiet(async () => {
    const { curriculum } = await readyCurriculum();
    finishAll(curriculum.id);
    const original = fakeAi.extendOutline;
    const lesson = (title: string) => ({ title, objective: "o", skills: ["Not A Slug"], bookSectionIndex: 99, estimatedMinutes: 999 });
    fakeAi.extendOutline = async () => ({
      lessons: [lesson("foundations "), ...Array.from({ length: 30 }, (_, i) => lesson(`New ${i}`))],
    });
    const res = await keepGoing(curriculum.id);
    expect(res.status).toBe(201);
    const added = res.body.lessons.slice(4);
    // The repeat of "Foundations" is cut from the capped batch.
    expect(added).toHaveLength(MAX_EXTEND_LESSONS - 1);
    expect(added[0]).toMatchObject({ title: "New 0", skills: ["not-a-slug"], estimatedMinutes: 60 });

    await flushBackground();
    finishAll(curriculum.id);
    fakeAi.extendOutline = async () => ({ lessons: [lesson("Foundations")] });
    const nothingNew = await keepGoing(curriculum.id);
    fakeAi.extendOutline = original;
    expect(nothingNew.status).toBe(502);
  }));

  it("stops at the longest plan allowed", async () => {
    const { curriculum } = await readyCurriculum();
    const store = memory();
    const filler = Array.from({ length: MAX_CURRICULUM_LESSONS - 4 - 2 }, (_, i) => ({
      kind: "core" as const,
      title: `Filler ${i}`,
      objective: "o",
      skills: ["s"],
      retryOfLessonId: null,
      bookSectionIndex: null,
      reason: null,
      estimatedMinutes: 10,
    }));
    await store.appendLessons(curriculum.id, filler);
    finishAll(curriculum.id);
    const nearlyFull = await keepGoing(curriculum.id);
    expect(nearlyFull.status).toBe(201);
    expect(nearlyFull.body.lessons).toHaveLength(MAX_CURRICULUM_LESSONS);
    await flushBackground();
    finishAll(curriculum.id);
    expect((await keepGoing(curriculum.id)).status).toBe(409);
  });

  it("continues with the book's untaught sections", async () => {
    const bookId = crypto.randomUUID();
    memory().data.books.push({
      ownerId: parent.user.id,
      id: bookId,
      title: "B",
      storagePath: "books/x.pdf",
      status: "ready",
      sections: Array.from({ length: 6 }, (_, index) => ({ index, chapter: "1", title: `Section ${index}`, summary: "s" })),
    });
    const { curriculum } = await readyCurriculum();
    memory().data.curricula[0].bookId = bookId;
    memory().data.lessons.forEach((l, i) => (l.bookSectionIndex = i));
    finishAll(curriculum.id);
    const res = await keepGoing(curriculum.id);
    expect(res.status).toBe(201);
    const added = memory().data.lessons.filter((l) => l.position >= 4).sort((a, b) => a.position - b.position);
    expect(added.map((l) => l.bookSectionIndex)).toEqual([4, 5, null]);
  });

  it("needs a session, the owner and a valid id", async () => {
    const { curriculum } = await readyCurriculum();
    finishAll(curriculum.id);
    expect((await keepGoing(curriculum.id, { cookie: "" })).status).toBe(401);
    const other = await signUpParent("other@example.com");
    expect((await keepGoing(curriculum.id, { cookie: other.cookie })).status).toBe(404);
    expect((await keepGoing("nope")).status).toBe(400);
    expect((await keepGoing(crypto.randomUUID())).status).toBe(404);
    expect(memory().data.lessons).toHaveLength(4);
  });
});
