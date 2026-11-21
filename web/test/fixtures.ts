import type { GenerateLessonInput as Input } from "@/contracts/ai";

export const GenerateLessonInput: Input = {
  subject: "Math",
  lesson: { title: "Fractions", objective: "Add fractions", skills: ["adding-fractions"], kind: "core" },
  learner: { gradeLevel: 5, notes: "", mastery: [] },
  previousLessonTitles: [],
  sourceChunks: [],
};
