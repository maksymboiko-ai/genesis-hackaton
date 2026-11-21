import { LogoutResponse } from "@/contracts/api";
import { ACCESS_COOKIE, clearedCookies, forgetToken, getAuth, readCookie } from "@/lib/server/auth";
import { ok, publicRoute } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

// POST /api/auth/logout — revokes the session and clears the cookies.
export const POST = publicRoute(
  async (req: Request) => {
    const access = readCookie(req, ACCESS_COOKIE);
    if (access) {
      forgetToken(access);
      await getAuth().signOut(access);
    }
    const res = ok(LogoutResponse, { ok: true });
    for (const c of clearedCookies(req)) res.headers.append("Set-Cookie", c);
    return res;
  },
  { limit: LIMITS.write },
);
