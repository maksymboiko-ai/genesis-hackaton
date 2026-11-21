import { AuthResponse, LoginRequest } from "@/contracts/api";
import { getAuth, sessionCookies } from "@/lib/server/auth";
import { ok, parseJson, publicRoute } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

// POST /api/auth/login
export const POST = publicRoute(
  async (req: Request) => {
    const body = await parseJson(req, LoginRequest);
    const { user, session } = await getAuth().signIn(body.email.trim().toLowerCase(), body.password);
    const res = ok(AuthResponse, { user });
    for (const c of sessionCookies(req, session)) res.headers.append("Set-Cookie", c);
    return res;
  },
  { limit: LIMITS.login },
);
