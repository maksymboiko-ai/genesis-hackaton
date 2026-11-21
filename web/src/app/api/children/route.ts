import { z } from "zod";
import { CreateChildRequest, CreateChildResponse, ListChildrenResponse } from "@/contracts/api";
import { MAX_CHILD_NAME, createChild, listChildren } from "@/lib/server/children";
import { ok, parseJson, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

// POST /api/children
export const POST = route(
  async (req: Request, _ctx, user) => {
    const body = await parseJson(req, CreateChildRequest.extend({ name: z.string().trim().min(1).max(MAX_CHILD_NAME) }));
    return ok(CreateChildResponse, await createChild(user, body), 201);
  },
  { limit: LIMITS.write },
);

// GET /api/children
export const GET = route(
  async (_req, _ctx, user) => ok(ListChildrenResponse, { children: await listChildren(user) }),
  { limit: LIMITS.read },
);
