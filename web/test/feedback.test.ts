import { describe, expect, it } from "vitest";
import { SubmitAttemptResponse } from "@/contracts/api";
import { fakeAi } from "@/lib/server/ai-fake";
import { fallbackFeedback } from "@/lib/server/feedback";
import { answers, attempt, memory, readyCurriculum } from "./helpers";

const quiet = async <T>(fn: () => Promise<T>) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

const result = (correct: boolean) => ({ questionId: "q", skill: "s", chosenIndex: 0, correctIndex: correct ? 0 : 1, correct, explanation: "e" });

describe("attempt feedback", () => {
  it("is written by the model and returned with the results", async () => {
    const { curriculum } = await readyCurriculum();
    let seen: unknown;
    const original = fakeAi.writeAttemptFeedback;
    fakeAi.writeAttemptFeedback = async (input) => {
      seen = input;
      return { headline: " Nice. The sign is starting to stick. ", summary: "You kept the sign right on every + question." };
    };
    try {
      const lessonId = curriculum.lessons[0].id;
      const res = await attempt(lessonId, { answers: answers(lessonId, 2) });
      const body = SubmitAttemptResponse.parse(res.body);
      expect(body.feedback).toEqual({ headline: "Nice. The sign is starting to stick.", summary: "You kept the sign right on every + question." });
    } finally {
      fakeAi.writeAttemptFeedback = original;
    }
    const input = seen as { gradeLevel: number; attempt: { wrongAnswers: unknown[] }; rightAnswers: unknown[] };
    expect(input.gradeLevel).toBe(5);
    expect(input.rightAnswers).toHaveLength(2);
    expect(input.attempt.wrongAnswers).toHaveLength(1);
    expect(JSON.stringify(input)).not.toContain("Mia");
    expect(memory().data.llmCalls.some((c) => c.task === "feedback")).toBe(true);
  });

  it("falls back to a plain message when the model fails or returns nothing; the attempt is still stored", () =>
    quiet(async () => {
      const { curriculum } = await readyCurriculum();
      const original = fakeAi.writeAttemptFeedback;
      try {
        fakeAi.writeAttemptFeedback = async () => {
          throw new Error("model down");
        };
        const l0 = curriculum.lessons[0].id;
        const r0 = await attempt(l0, { answers: answers(l0, 0) });
        expect(r0.status).toBe(201);
        expect(r0.body.feedback.headline).toBe("This one was tricky. That's useful to know.");

        fakeAi.writeAttemptFeedback = async () => ({ headline: "   ", summary: "" });
        const l1 = curriculum.lessons[1].id;
        const r1 = await attempt(l1, { answers: answers(l1, 3) });
        expect(r1.body.feedback.headline).toBe("All of them held up.");
        expect(memory().data.attempts).toHaveLength(2);
      } finally {
        fakeAi.writeAttemptFeedback = original;
      }
    }));

  it("caps long model text", async () => {
    const { curriculum } = await readyCurriculum();
    const original = fakeAi.writeAttemptFeedback;
    fakeAi.writeAttemptFeedback = async () => ({ headline: "h".repeat(500), summary: "s".repeat(5000) });
    try {
      const l0 = curriculum.lessons[0].id;
      const res = await attempt(l0, { answers: answers(l0, 1) });
      expect(res.body.feedback.headline.length).toBeLessThanOrEqual(120);
      expect(res.body.feedback.summary.length).toBeLessThanOrEqual(400);
    } finally {
      fakeAi.writeAttemptFeedback = original;
    }
  });

  it("fallback wording follows the score", () => {
    expect(fallbackFeedback([result(true), result(true)]).headline).toBe("All of them held up.");
    expect(fallbackFeedback([result(true), result(true), result(false)]).summary).toBe("2 of 3. One to look at again, below.");
    expect(fallbackFeedback([result(false), result(false), result(true)]).headline).toMatch(/tricky/);
  });
});
