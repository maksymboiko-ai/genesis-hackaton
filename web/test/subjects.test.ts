import { describe, expect, it } from "vitest";
import { POST as createChild } from "@/app/api/children/route";
import { POST as createCurriculum } from "@/app/api/curricula/route";
import type { GenerateOutlineInput } from "@/contracts/ai";
import {
  GRADE_SUBJECTS,
  findGradeSubject,
  gradeSubjectFor,
  popularSubjects,
  subjectFamily,
  subjectsForGrade,
} from "@/contracts/subjects";
import { outlinePrompt } from "@/lib/ai/prompts";
import { fakeAi } from "@/lib/server/ai-fake";
import { call, jsonRequest } from "./helpers";

async function newChild(gradeLevel: number) {
  const res = await call(createChild, jsonRequest("POST", "/api/children", { name: "Sam", gradeLevel }));
  return res.body.id as string;
}

const post = (body: unknown) => call(createCurriculum, jsonRequest("POST", "/api/curricula", body));
const plan = (childId: string, extra: object = {}) =>
  post({ childId, prompt: "the topic that is hard this term", bookId: null, clarifications: [], ...extra });

describe("grade subjects", () => {
  it("lists every grade with its own subjects", () => {
    expect(Object.keys(GRADE_SUBJECTS).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(subjectsForGrade(3).map((s) => s.name)).toEqual([
      "English Language Arts",
      "Mathematics",
      "Science",
      "Social Studies",
      "Art",
      "Music",
      "Physical Education",
    ]);
    expect(subjectsForGrade(12).map((s) => s.name)).toEqual([
      "English IV",
      "Precalculus",
      "Environmental Science",
      "Economics",
      "Computer Science",
      "Creative Writing",
    ]);
    for (const grade of Object.values(GRADE_SUBJECTS)) {
      expect(new Set(grade.map((s) => s.name)).size).toBe(grade.length);
    }
  });

  it("shows the grade's English, math and science course as popular", () => {
    expect(popularSubjects(8).map((s) => s.name)).toEqual(["English Language Arts", "Pre-Algebra", "Physical Science"]);
    expect(popularSubjects(12).map((s) => s.name)).toEqual(["English IV", "Precalculus", "Environmental Science"]);
    for (let grade = 1; grade <= 12; grade++) {
      expect(popularSubjects(grade).map((s) => s.family)).toEqual(["read", "math", "sci"]);
    }
  });

  it("matches names loosely and maps other subjects onto the grade", () => {
    expect(findGradeSubject(9, "algebra i")?.name).toBe("Algebra I");
    expect(findGradeSubject(12, "Reading")).toBeNull();
    expect(gradeSubjectFor(12, "reading").name).toBe("English IV");
    expect(gradeSubjectFor(10, "algebra").name).toBe("Geometry");
    expect(gradeSubjectFor(3, "biology").name).toBe("Science");
    expect(subjectFamily("Physical Education and Health")).toBe("move");
    expect(subjectFamily("Introduction to Computer Science")).toBe("tech");
    expect(subjectFamily("Creative Writing")).toBe("arts");
  });
});

describe("plan subject", () => {
  it("keeps the subject the parent picked", async () => {
    const childId = await newChild(8);
    const res = await plan(childId, { subject: "u.s. history" });
    expect(res.status).toBe(201);
    expect(res.body.curriculum.subject).toBe("U.S. History");
  });

  it("refuses a subject the grade does not have", async () => {
    const childId = await newChild(12);
    const res = await plan(childId, { subject: "Reading" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("passes the grade's subjects to the model and maps drift back onto them", async () => {
    const childId = await newChild(12);
    const seen: GenerateOutlineInput[] = [];
    const original = fakeAi.generateOutline;
    fakeAi.generateOutline = async (input) => {
      seen.push(input);
      const result = await original(input);
      return result.kind === "outline" ? { ...result, outline: { ...result.outline, subject: "reading" } } : result;
    };
    try {
      const res = await plan(childId);
      expect(res.status).toBe(201);
      expect(res.body.curriculum.subject).toBe("English IV");
    } finally {
      fakeAi.generateOutline = original;
    }
    expect(seen[0].subjects).toEqual(subjectsForGrade(12).map((s) => s.name));
    expect(seen[0].subject).toBeNull();
    expect(outlinePrompt(seen[0]).system).toContain('"Precalculus"');
  });
});
