import { describe, expect, it } from "vitest";
import { POST as createChild } from "@/app/api/children/route";
import { GET as listCurricula, POST as createCurriculum } from "@/app/api/curricula/route";
import { GET as getCurriculum } from "@/app/api/curricula/[curriculumId]/route";
import { CreateCurriculumResponse, GetCurriculumResponse } from "@/contracts/api";
import { fakeAi } from "@/lib/server/ai-fake";
import { MAX_OUTLINE_LESSONS, validateOutline } from "@/lib/server/curricula";
import { call, jsonRequest, memory } from "./helpers";

async function newChild() {
  const res = await call(createChild, jsonRequest("POST", "/api/children", { name: "Mia", gradeLevel: 5 }));
  return res.body.id as string;
}

const post = (body: unknown) => call(createCurriculum, jsonRequest("POST", "/api/curricula", body));

function withOutline<T>(outline: unknown, fn: () => Promise<T>) {
  const original = fakeAi.generateOutline;
  fakeAi.generateOutline = async () => outline as never;
  return fn().finally(() => {
    fakeAi.generateOutline = original;
  });
}

describe("validateOutline", () => {
  const sections = [
    { index: 0, chapter: "", title: "A", summary: "" },
    { index: 1, chapter: "", title: "B", summary: "" },
  ];
  it("normalizes skills, drops bad sections and caps lessons", () => {
    const out = validateOutline(
      {
        subject: " Math ",
        title: "Fractions",
        lessons: [
          { title: "One", objective: "o", skills: ["Adding Fractions", "!!!", "adding-fractions"], bookSectionIndex: 1 },
          { title: "Two", objective: "o", skills: [], bookSectionIndex: 7 },
          { title: "", objective: "o", skills: ["x"], bookSectionIndex: null },
          { title: "Three", objective: "o", skills: ["x"], bookSectionIndex: 0.5 },
        ],
      },
      sections,
      "prompt",
    );
    expect(out.subject).toBe("Math");
    expect(out.lessons).toHaveLength(3);
    expect(out.lessons[0]).toMatchObject({ skills: ["adding-fractions"], bookSectionIndex: 1, kind: "core" });
    expect(out.lessons[1]).toMatchObject({ skills: ["two"], bookSectionIndex: null });
    expect(out.lessons[2].bookSectionIndex).toBeNull();

    const many = Array.from({ length: 50 }, (_, i) => ({ title: `L${i}`, objective: "o", skills: ["s"], bookSectionIndex: null }));
    expect(validateOutline({ subject: "s", title: "t", lessons: many }, [], "p").lessons).toHaveLength(MAX_OUTLINE_LESSONS);
  });

  it("throws a safe 502 when nothing usable is left", () => {
    expect(() => validateOutline({ subject: "", title: "", lessons: [] }, [], "p")).toThrow(
      expect.objectContaining({ status: 502 }),
    );
  });
});

describe("POST /api/curricula", () => {
  it("vague prompt → questions, nothing stored; answers → created", async () => {
    const childId = await newChild();
    const first = await post({ childId, prompt: "help math", bookId: null, clarifications: [] });
    expect(first.status).toBe(200);
    expect(CreateCurriculumResponse.parse(first.body).status).toBe("needs_clarification");
    expect(first.body.questions.length).toBeGreaterThan(0);
    expect(memory().data.curricula).toHaveLength(0);

    const answers = first.body.questions.map((question: string) => ({ question, answer: "fractions" }));
    const second = await post({ childId, prompt: "help math", bookId: null, clarifications: answers });
    expect(second.status).toBe(201);
    const parsed = CreateCurriculumResponse.parse(second.body);
    if (parsed.status !== "created") throw new Error("expected created");
    expect(parsed.curriculum.lessons.map((l) => l.position)).toEqual([0, 1, 2, 3]);
    expect(parsed.curriculum.lessons.every((l) => l.kind === "core")).toBe(true);
    // Lesson 1 is claimed for background generation before the response.
    expect(parsed.curriculum.lessons.map((l) => l.contentStatus)).toEqual(["generating", "pending", "pending", "pending"]);
    expect(parsed.curriculum.replanStatus).toBe("idle");
  });

  it("validates the body", async () => {
    const childId = await newChild();
    const bad = [
      { childId, prompt: "", bookId: null, clarifications: [] },
      { childId, prompt: "x".repeat(2001), bookId: null, clarifications: [] },
      { childId: "nope", prompt: "fractions please now", bookId: null, clarifications: [] },
      { childId, prompt: "fractions please now", bookId: null },
      { childId, prompt: "fractions please now", bookId: null, clarifications: Array(4).fill({ question: "q", answer: "a" }) },
      { childId, prompt: "   ", bookId: null, clarifications: [] },
    ];
    for (const body of bad) expect((await post(body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
  });

  it("unknown child → 404, unknown book → 404, book not ready → 409", async () => {
    const childId = await newChild();
    const body = { prompt: "fractions for fifth grade", clarifications: [] };
    expect((await post({ ...body, childId: crypto.randomUUID(), bookId: null })).status).toBe(404);
    expect((await post({ ...body, childId, bookId: crypto.randomUUID() })).status).toBe(404);
    const bookId = crypto.randomUUID();
    memory().data.books.push({ id: bookId, title: "B", storagePath: "books/x.pdf", status: "processing", sections: [] });
    const notReady = await post({ ...body, childId, bookId });
    expect(notReady.status).toBe(409);
    expect(notReady.body.error.code).toBe("conflict");
  });

  it("plans from the book map and keeps valid section indexes", async () => {
    const childId = await newChild();
    const bookId = crypto.randomUUID();
    memory().data.books.push({
      id: bookId,
      title: "B",
      storagePath: "books/x.pdf",
      status: "ready",
      sections: [
        { index: 0, chapter: "1", title: "Intro", summary: "s" },
        { index: 1, chapter: "1", title: "More", summary: "s" },
      ],
    });
    const res = await post({ childId, prompt: "fractions for fifth grade", bookId, clarifications: [] });
    expect(res.status).toBe(201);
    const stored = memory().data.lessons.map((l) => l.bookSectionIndex);
    expect(stored).toEqual([0, 1, 0, 1]);
  });

  it("treats model output as untrusted: caps, slugs, questions after answers", async () => {
    const childId = await newChild();
    const huge = {
      kind: "outline",
      outline: {
        subject: "Math",
        title: "T",
        lessons: Array.from({ length: 40 }, (_, i) => ({
          title: `<b>L${i}</b>`,
          objective: "o",
          skills: ["Not A Slug", "ok-slug"],
          bookSectionIndex: 99,
        })),
      },
    };
    const res = await withOutline(huge, () => post({ childId, prompt: "fractions for fifth grade", bookId: null, clarifications: [] }));
    expect(res.status).toBe(201);
    expect(res.body.curriculum.lessons).toHaveLength(MAX_OUTLINE_LESSONS);
    expect(res.body.curriculum.lessons[0].skills).toEqual(["not-a-slug", "ok-slug"]);

    const original = console.error;
    console.error = () => {};
    const loop = await withOutline({ kind: "questions", questions: ["again?"] }, () =>
      post({ childId, prompt: "math", bookId: null, clarifications: [{ question: "q", answer: "a" }] }),
    );
    console.error = original;
    expect(loop.status).toBe(502);
  });

  it("lists by child (newest first) and gets by id", async () => {
    const childId = await newChild();
    await post({ childId, prompt: "fractions for fifth grade", bookId: null, clarifications: [] });
    await new Promise((r) => setTimeout(r, 5));
    const second = await post({ childId, prompt: "decimals for fifth grade", bookId: null, clarifications: [] });

    const list = await call(listCurricula, jsonRequest("GET", `/api/curricula?childId=${childId}`));
    expect(list.status).toBe(200);
    expect(list.body.curricula).toHaveLength(2);
    expect(list.body.curricula[0].id).toBe(second.body.curriculum.id);
    expect(list.body.curricula[0].lessons).toBeUndefined();

    const one = await call(getCurriculum, jsonRequest("GET", "/x"), { curriculumId: second.body.curriculum.id });
    expect(one.status).toBe(200);
    GetCurriculumResponse.parse(one.body);

    expect((await call(listCurricula, jsonRequest("GET", "/api/curricula"))).status).toBe(400);
    expect((await call(listCurricula, jsonRequest("GET", `/api/curricula?childId=${crypto.randomUUID()}`))).status).toBe(404);
    expect((await call(getCurriculum, jsonRequest("GET", "/x"), { curriculumId: crypto.randomUUID() })).status).toBe(404);
  });

  it("rate-limits curriculum creation per IP", async () => {
    const childId = await newChild();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const req = jsonRequest("POST", "/api/curricula", { childId, prompt: "fractions for fifth grade", bookId: null, clarifications: [] }, { "x-forwarded-for": "9.9.9.9" });
      statuses.push((await call(createCurriculum, req)).status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });
});
