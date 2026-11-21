import { z } from "zod";
import { GetStreakResponse } from "@/contracts/api";
import { Id } from "@/contracts/domain";
import { ok, parseWith, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";
import { getStreakDays } from "@/lib/server/streak";

const Params = z.object({ childId: Id });

// GET /api/children/:childId/streak
export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ childId: string }> }, user) => {
    const { childId } = parseWith(Params, await ctx.params);
    return ok(GetStreakResponse, { days: await getStreakDays(user, childId) });
  },
  { limit: LIMITS.read },
);
