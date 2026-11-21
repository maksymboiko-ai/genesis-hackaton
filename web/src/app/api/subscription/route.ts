import { GetSubscriptionResponse, StartTrialRequest, StartTrialResponse } from "@/contracts/api";
import { ok, parseJson, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";
import { getSubscription, startTrial } from "@/lib/server/subscription";

// GET /api/subscription: the account's trial and payment state.
export const GET = route(
  async (_req: Request, _ctx, user) => ok(GetSubscriptionResponse, await getSubscription(user)),
  { limit: LIMITS.read },
);

// POST /api/subscription: starts the account's free trial.
export const POST = route(
  async (req: Request, _ctx, user) => {
    const body = await parseJson(req, StartTrialRequest);
    return ok(StartTrialResponse, await startTrial(user, body.plan), 201);
  },
  { limit: LIMITS.write },
);
