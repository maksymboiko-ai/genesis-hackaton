import { describe, expect, it } from "vitest";
import { POST as createChild } from "@/app/api/children/route";
import { POST as createCurriculum } from "@/app/api/curricula/route";
import { GET as getLesson } from "@/app/api/lessons/[lessonId]/route";
import { GetLessonResponse } from "@/contracts/api";
import { LESSON_CHUNK_LIMIT, type LessonContent } from "@/contracts/domain";
import { fakeAi, fakeEmbedding } from "@/lib/server/ai-fake";
import { flushBackground } from "@/lib/server/background";
import { checkLessonContent } from "@/lib/server/lessons";
import { chunksForLesson } from "@/lib/server/retrieval";
import type { LessonRow } from "@/lib/server/store/types";
import { call, jsonRequest, memory } from "./helpers";

async function setup(bookId: string | null = null) {
  const child = await call(createChild, jsonRequest("POST", "/api/children", { name: "Mia", gradeLevel: 5 }));
  const res = await call(
    createCurriculum,
    jsonRequest("POST", "/api/curricula", { childId: child.body.id, prompt: "fractions for fifth grade", bookId, clarifications: [] }),
  );
  expect(res.status).toBe(201);
  return res.body.curriculum as { id: string; lessons: { id: string; contentStatus: string }[] };
}

const open = (lessonId: string) => call(getLesson, jsonRequest("GET", "/x"), { lessonId });
const quiet = async <T>(fn: () => Promise<T>) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

describe("lesson generation", () => {
  it("creating a curriculum starts lesson 1; it becomes ready and lesson 2 is prefetched", async () => {
    const curriculum = await setup();
    expect(curriculum.lessons[0].contentStatus).toBe("generating");
    await flushBackground();

    const first = await open(curriculum.lessons[0].id);
    expect(first.status).toBe(200);
    const parsed = GetLessonResponse.parse(first.body);
    expect(parsed.contentStatus).toBe("ready");
    expect(parsed.content?.questions.length).toBeGreaterThan(0);

    const statuses = memory().data.lessons.sort((a, b) => a.position - b.position).map((l) => l.contentStatus);
    expect(statuses).toEqual(["ready", "ready", "pending", "pending"]);
  });

  it("never returns correctIndex or explanation", async () => {
    const curriculum = await setup();
    await flushBackground();
    const res = await open(curriculum.lessons[0].id);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("correctIndex");
    expect(raw).not.toContain("explanation");
  });

  it("opening a pending lesson claims it once, even with parallel requests", async () => {
    const curriculum = await setup();
    await flushBackground();
    let calls = 0;
    const original = fakeAi.generateLesson;
    fakeAi.generateLesson = async (input) => {
      calls++;
      return original(input);
    };
    const third = curriculum.lessons[2].id;
    const results = await Promise.all(Array.from({ length: 20 }, () => open(third)));
    await flushBackground();
    fakeAi.generateLesson = original;
    expect(results.every((r) => r.status === 200)).toBe(true);
    // The third lesson plus the prefetched fourth: two calls, not twenty.
    expect(calls).toBe(2);
  });

  it("a failed lesson stays failed while polled, and is retried after the cooldown", () => quiet(async () => {
    const original = fakeAi.generateLesson;
    fakeAi.generateLesson = async () => {
      throw new Error("model down");
    };
    let curriculum;
    try {
      curriculum = await setup();
      await flushBackground();
    } finally {
      fakeAi.generateLesson = original;
    }

    const row = memory().data.lessons.find((l) => l.id === curriculum.lessons[0].id)!;
    expect(row.contentStatus).toBe("failed");
    // Polling right after the failure reports it instead of retrying.
    expect((await open(row.id)).body.contentStatus).toBe("failed");

    row.generationStartedAt = new Date(Date.now() - 2 * 60_000).toISOString();
    const retry = await open(row.id);
    expect(retry.body.contentStatus).toBe("generating");
    await flushBackground();
    expect((await open(row.id)).body.contentStatus).toBe("ready");
  }));

  it("a stuck 'generating' lesson is reclaimed after the timeout", async () => {
    const curriculum = await setup();
    await flushBackground();
    const row = memory().data.lessons.find((l) => l.id === curriculum.lessons[3].id)!;
    row.contentStatus = "generating";
    row.generationStartedAt = new Date(Date.now() - 60_000).toISOString();
    await open(row.id);
    await flushBackground();
    expect(row.contentStatus).toBe("generating"); // fresh job, not reclaimed yet

    row.generationStartedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    await open(row.id);
    await flushBackground();
    expect(memory().data.lessons.find((l) => l.id === row.id)!.contentStatus).toBe("ready");
  });

  it("bad id → 400, unknown → 404", async () => {
    expect((await open("1; drop table lesson")).status).toBe(400);
    expect((await open(crypto.randomUUID())).status).toBe(404);
  });
});

describe("checkLessonContent", () => {
  const q = (over: Partial<LessonContent["questions"][number]> = {}) => ({
    id: "q1",
    prompt: "2+2?",
    choices: ["1", "2", "3", "4"],
    correctIndex: 3,
    explanation: "because",
    skill: "adding",
    ...over,
  });

  it("drops script HTML, fixes duplicate ids, caps questions", () => {
    const out = checkLessonContent({
      bodyMarkdown: "Hi <script>alert(1)</script> [x](javascript:alert(1))",
      questions: [q(), q(), ...Array.from({ length: 20 }, (_, i) => q({ id: `x${i}` }))],
    });
    expect(out.bodyMarkdown).not.toMatch(/script|javascript:/);
    expect(out.questions).toHaveLength(10);
    expect(new Set(out.questions.map((x) => x.id)).size).toBe(10);
  });

  it("throws when no question is usable", () => {
    expect(() => checkLessonContent({ bodyMarkdown: "x", questions: [q({ skill: "Not A Slug" })] })).toThrow();
  });
});

describe("retrieval", () => {
  function seedBook(sectionSizes: number[]) {
    const bookId = crypto.randomUUID();
    memory().data.books.push({
      id: bookId,
      title: "B",
      storagePath: "books/b.pdf",
      status: "ready",
      sections: sectionSizes.map((_, index) => ({ index, chapter: "", title: `S${index}`, summary: "" })),
    });
    let chunkIndex = 0;
    sectionSizes.forEach((size, sectionIndex) => {
      for (let i = 0; i < size; i++) {
        const content = `section ${sectionIndex} part ${i} ${i === size - 1 ? "fractions denominators" : "other words"}`;
        memory().data.chunks.push({ bookId, chunkIndex: chunkIndex++, content, sectionIndex, embedding: fakeEmbedding(content) });
      }
    });
    return bookId;
  }

  const lesson = (over: Partial<LessonRow>): LessonRow => ({
    id: crypto.randomUUID(),
    curriculumId: "c",
    position: 0,
    kind: "core",
    title: "Fractions",
    objective: "denominators",
    skills: ["fractions"],
    retryOfLessonId: null,
    contentStatus: "generating",
    content: null,
    completedAt: null,
    lastScore: null,
    bookSectionIndex: null,
    generationStartedAt: null,
    createdAt: new Date().toISOString(),
    ...over,
  });

  const curriculum = (bookId: string | null) => ({
    id: "c",
    childId: "x",
    bookId,
    prompt: "p",
    subject: "Math",
    title: "t",
    replanStatus: "idle" as const,
    lastReplanAt: null,
    replanStartedAt: null,
    createdAt: new Date().toISOString(),
  });

  it("no book → []", async () => {
    expect(await chunksForLesson(lesson({}), curriculum(null), [])).toEqual([]);
  });

  it("small section → all chunks in reading order, no embedding call", async () => {
    const bookId = seedBook([3, 2]);
    let embeds = 0;
    const original = fakeAi.embed;
    fakeAi.embed = async (t) => {
      embeds++;
      return original(t);
    };
    const out = await chunksForLesson(lesson({ bookSectionIndex: 1 }), curriculum(bookId), []);
    fakeAi.embed = original;
    expect(out.map((c) => c.split(" ").slice(0, 4).join(" "))).toEqual(["section 1 part 0", "section 1 part 1"]);
    expect(embeds).toBe(0);
  });

  it("large section → nearest LESSON_CHUNK_LIMIT chunks of that section, in reading order", async () => {
    const bookId = seedBook([2, LESSON_CHUNK_LIMIT + 5]);
    const out = await chunksForLesson(lesson({ bookSectionIndex: 1 }), curriculum(bookId), []);
    expect(out).toHaveLength(LESSON_CHUNK_LIMIT);
    expect(out.every((c) => c.startsWith("section 1"))).toBe(true);
    expect(out.some((c) => c.includes("fractions denominators"))).toBe(true);
    const order = out.map((c) => Number(c.split(" ")[3]));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("remedial lesson without a section searches the whole book; retry keeps its original's section", async () => {
    const bookId = seedBook([3, 3]);
    const remedial = await chunksForLesson(lesson({ kind: "remedial" }), curriculum(bookId), []);
    expect(new Set(remedial.map((c) => c.split(" ")[1])).size).toBe(2);

    const original = lesson({ bookSectionIndex: 0 });
    const retry = lesson({ kind: "retry", retryOfLessonId: original.id });
    const out = await chunksForLesson(retry, curriculum(bookId), [original, retry]);
    expect(out.every((c) => c.startsWith("section 0"))).toBe(true);
  });

  it("book not ready → []", async () => {
    const bookId = seedBook([2]);
    memory().data.books[0].status = "processing";
    expect(await chunksForLesson(lesson({ bookSectionIndex: 0 }), curriculum(bookId), [])).toEqual([]);
  });
});
