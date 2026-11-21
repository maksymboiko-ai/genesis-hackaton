import { z } from "zod";
import { GetProfileResponse } from "@/contracts/api";
import { Id } from "@/contracts/domain";
import { ownedChild } from "@/lib/server/access";
import { buildLearnerProfile } from "@/lib/server/children";
import { ok, parseWith, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

const Params = z.object({ childId: Id });

// GET /api/children/:childId/profile
export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ childId: string }> }, user) => {
    const { childId } = parseWith(Params, await ctx.params);
    await ownedChild(user, childId);
    return ok(GetProfileResponse, await buildLearnerProfile(childId));
  },
  { limit: LIMITS.read },
);
