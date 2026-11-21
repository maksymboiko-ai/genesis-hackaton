import { z } from "zod";
import { SubmitAttemptRequest, SubmitAttemptResponse } from "@/contracts/api";
import { CHOICES_PER_QUESTION, Id } from "@/contracts/domain";
import { submitAttempt } from "@/lib/server/attempts";
import { ok, parseJson, parseWith, route } from "@/lib/server/http";
import { MAX_QUESTIONS } from "@/lib/server/lessons";
import { LIMITS } from "@/lib/server/rate-limit";

// Replans and learner notes run in after(), inside this function's budget.
export const maxDuration = 60;

const Params = z.object({ lessonId: Id });

// The contract leaves these unbounded; a lesson never has more than
// MAX_QUESTIONS questions, so more answers are rejected at the edge.
const Body = SubmitAttemptRequest.extend({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(100),
        chosenIndex: z.number().int().min(0).max(CHOICES_PER_QUESTION - 1),
      }),
    )
    .min(1)
    .max(MAX_QUESTIONS),
});

// POST /api/lessons/:lessonId/attempts
export const POST = route(
  async (req: Request, ctx: { params: Promise<{ lessonId: string }> }) => {
    const { lessonId } = parseWith(Params, await ctx.params);
    const body = await parseJson(req, Body);
    return ok(SubmitAttemptResponse, await submitAttempt(lessonId, body), 201);
  },
  { limit: LIMITS.attempt },
);
