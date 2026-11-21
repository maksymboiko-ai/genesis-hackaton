import { z } from "zod";
import { ExtendCurriculumResponse } from "@/contracts/api";
import { Id } from "@/contracts/domain";
import { extendCurriculum } from "@/lib/server/curricula";
import { ok, parseWith, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

// The next lessons are planned before responding.
export const maxDuration = 60;

const Params = z.object({ curriculumId: Id });

// POST /api/curricula/:curriculumId/extend — "Keep going" on a finished plan.
export const POST = route(
  async (_req: Request, ctx: { params: Promise<{ curriculumId: string }> }, user) => {
    const { curriculumId } = parseWith(Params, await ctx.params);
    return ok(ExtendCurriculumResponse, await extendCurriculum(user, curriculumId), 201);
  },
  { limit: LIMITS.curriculum },
);
