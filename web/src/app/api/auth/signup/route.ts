import { AuthResponse, SignUpRequest } from "@/contracts/api";
import { getAuth, sessionCookies } from "@/lib/server/auth";
import { ok, parseJson, publicRoute } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";
import { cleanText } from "@/lib/server/text";

// POST /api/auth/signup — creates the parent's account and signs in.
export const POST = publicRoute(
  async (req: Request) => {
    const body = await parseJson(req, SignUpRequest);
    const { user, session } = await getAuth().signUp({
      name: cleanText(body.name, 100),
      email: body.email.trim().toLowerCase(),
      password: body.password,
    });
    const res = ok(AuthResponse, { user }, 201);
    for (const c of sessionCookies(req, session)) res.headers.append("Set-Cookie", c);
    return res;
  },
  { limit: LIMITS.signup },
);
