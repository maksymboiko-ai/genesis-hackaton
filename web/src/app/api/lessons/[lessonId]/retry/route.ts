import { z } from "zod";
import { RetryLessonResponse } from "@/contracts/api";
import { Id } from "@/contracts/domain";
import { ok, parseWith, route } from "@/lib/server/http";
import { retryLesson } from "@/lib/server/lessons";
import { LIMITS } from "@/lib/server/rate-limit";

// Generation runs in after(), inside this function's time budget.
export const maxDuration = 60;

const Params = z.object({ lessonId: Id });

// POST /api/lessons/:lessonId/retry — "Try again" for a failed lesson.
export const POST = route(
  async (_req: Request, ctx: { params: Promise<{ lessonId: string }> }, user) => {
    const { lessonId } = parseWith(Params, await ctx.params);
    return ok(RetryLessonResponse, await retryLesson(user, lessonId));
  },
  { limit: LIMITS.retry },
);
