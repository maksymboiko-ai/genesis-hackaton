import { describe, expect, it } from "vitest";
import { GET as getCurriculum } from "@/app/api/curricula/[curriculumId]/route";
import { GetCurriculumResponse } from "@/contracts/api";
import { cleanMinutes, fallbackMinutes, minutesFromContent } from "@/lib/server/timing";
import { call, jsonRequest, memory, readyCurriculum } from "./helpers";

const question = { id: "q", prompt: "p", choices: ["a", "b", "c", "d"], correctIndex: 0, explanation: "e", choiceFeedback: ["a", "b", "c", "d"], skill: "s" };
const body = (words: number) => Array.from({ length: words }, () => "word").join(" ");

describe("lesson minutes", () => {
  it("are computed from the content: reading speed by grade plus the quiz", () => {
    const content = { bodyMarkdown: body(420), questions: Array(5).fill(question) };
    // grade 7: 420 / 140 = 3 min + 5 × 0.75 = 6.75 → 7
    expect(minutesFromContent(content, 7)).toBe(7);
    // grade 3: 420 / 90 = 4.7 → 5, + 3.75 → 8.75 → 9
    expect(minutesFromContent(content, 3)).toBe(9);
    expect(minutesFromContent({ bodyMarkdown: body(100_000), questions: [question] }, 5)).toBe(60);
  });

  it("model estimates are bounded, with a computed fallback", () => {
    expect(cleanMinutes(7.4, 9)).toBe(7);
    expect(cleanMinutes(500, 9)).toBe(60);
    expect(cleanMinutes(Number.NaN, 9)).toBe(9);
    expect(cleanMinutes(-2, 9)).toBe(9);
    expect(fallbackMinutes([6, 10, Number.NaN], 5)).toBe(8);
    expect(fallbackMinutes([], 3)).toBeGreaterThan(fallbackMinutes([], 10));
  });

  it("the model estimate shows until the lesson is written, then the computed one", async () => {
    const { curriculum } = await readyCurriculum();
    const res = await call(getCurriculum, jsonRequest("GET", "/x"), { curriculumId: curriculum.id });
    const lessons = GetCurriculumResponse.parse(res.body).lessons;
    // Lessons 3 and 4 are not written yet: the fake outline's estimates (6 + 2i).
    expect(lessons.slice(2).map((l) => l.estimatedMinutes)).toEqual([10, 12]);
    // Lesson 1 is written: computed from its content, not the outline's 6.
    const row = memory().data.lessons.find((l) => l.id === lessons[0].id)!;
    expect(lessons[0].estimatedMinutes).toBe(row.estimatedMinutes);
    // A few words, four blocks and three questions: under a minute + 4 × 0.75 + 3 × 0.75.
    expect(lessons[0].estimatedMinutes).toBe(6);
  });
});
