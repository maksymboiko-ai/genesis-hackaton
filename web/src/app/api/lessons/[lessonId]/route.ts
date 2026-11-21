import { z } from "zod";
import { GetLessonResponse } from "@/contracts/api";
import { Id } from "@/contracts/domain";
import { ok, parseWith, route } from "@/lib/server/http";
import { getLesson } from "@/lib/server/lessons";
import { LIMITS } from "@/lib/server/rate-limit";

// Generation runs in after(), inside this function's time budget.
export const maxDuration = 60;

const Params = z.object({ lessonId: Id });

// GET /api/lessons/:lessonId — poll until contentStatus is "ready" or "failed".
export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ lessonId: string }> }) => {
    const { lessonId } = parseWith(Params, await ctx.params);
    return ok(GetLessonResponse, await getLesson(lessonId));
  },
  { limit: LIMITS.read },
);
