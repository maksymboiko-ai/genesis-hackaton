import { StartTrialRequest, StartTrialResponse } from "@/contracts/api";
import { ok, parseJson, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";
import { startTrial } from "@/lib/server/subscription";

// POST /api/subscription: starts the account's free trial.
export const POST = route(
  async (req: Request, _ctx, user) => {
    const body = await parseJson(req, StartTrialRequest);
    return ok(StartTrialResponse, await startTrial(user, body.plan), 201);
  },
  { limit: LIMITS.write },
);
