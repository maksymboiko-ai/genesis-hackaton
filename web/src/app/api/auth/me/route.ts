import { AuthResponse } from "@/contracts/api";
import { ok, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

// GET /api/auth/me — the signed-in parent, or 401.
export const GET = route(async (_req, _ctx, user) => ok(AuthResponse, { user }), { limit: LIMITS.read });
