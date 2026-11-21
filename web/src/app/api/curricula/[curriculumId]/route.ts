import { z } from "zod";
import { GetCurriculumResponse } from "@/contracts/api";
import { Id } from "@/contracts/domain";
import { getCurriculum } from "@/lib/server/curricula";
import { ok, parseWith, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

const Params = z.object({ curriculumId: Id });

// GET /api/curricula/:curriculumId
export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ curriculumId: string }> }) => {
    const { curriculumId } = parseWith(Params, await ctx.params);
    return ok(GetCurriculumResponse, await getCurriculum(curriculumId));
  },
  { limit: LIMITS.read },
);
