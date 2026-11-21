import "server-only";
import { getEnv } from "../env";
import { MemoryAuth } from "./memory";
import { SupabaseAuth } from "./supabase";
import type { AuthProvider, AuthUser, Session } from "./types";

export type { AuthProvider, AuthUser, Session } from "./types";

// Sessions travel in two httpOnly cookies scoped to /api. JavaScript in the
// page never sees the tokens; SameSite=Lax keeps them off cross-site POSTs.
export const ACCESS_COOKIE = "sb-access";
export const REFRESH_COOKIE = "sb-refresh";
const REFRESH_MAX_AGE_S = 30 * 24 * 60 * 60;
// A verified access token is trusted this long without asking Supabase again
// (lesson polling would otherwise verify on every request).
const VERIFY_CACHE_MS = 60 * 1000;

const holder = globalThis as unknown as { __auth?: AuthProvider; __authCache?: Map<string, { user: AuthUser; until: number }> };
const cache = (holder.__authCache ??= new Map());

export function getAuth(): AuthProvider {
  if (holder.__auth) return holder.__auth;
  const env = getEnv();
  holder.__auth =
    env.STORE === "memory" ? new MemoryAuth() : new SupabaseAuth(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
  return holder.__auth;
}

/** Tests only. */
export function setAuthForTests(auth: AuthProvider | undefined) {
  holder.__auth = auth;
  cache.clear();
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function isHttps(req: Request): boolean {
  return req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:";
}

function cookie(req: Request, name: string, value: string, maxAgeS: number): string {
  const attrs = [`${name}=${encodeURIComponent(value)}`, "Path=/api", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeS}`];
  if (isHttps(req)) attrs.push("Secure");
  return attrs.join("; ");
}

export function sessionCookies(req: Request, session: Session): string[] {
  const accessMaxAge = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
  return [cookie(req, ACCESS_COOKIE, session.accessToken, accessMaxAge), cookie(req, REFRESH_COOKIE, session.refreshToken, REFRESH_MAX_AGE_S)];
}

export function clearedCookies(req: Request): string[] {
  return [cookie(req, ACCESS_COOKIE, "", 0), cookie(req, REFRESH_COOKIE, "", 0)];
}

/**
 * The signed-in user of a request, or null. A missing or expired access
 * token is renewed with the refresh token; the new cookies to send back are
 * returned in setCookies.
 */
export async function authenticate(req: Request): Promise<{ user: AuthUser; setCookies: string[] } | null> {
  const auth = getAuth();
  const access = readCookie(req, ACCESS_COOKIE);
  if (access) {
    const hit = cache.get(access);
    if (hit && hit.until > Date.now()) return { user: hit.user, setCookies: [] };
    const user = await auth.getUser(access);
    if (user) {
      if (cache.size > 5000) cache.clear();
      cache.set(access, { user, until: Date.now() + VERIFY_CACHE_MS });
      return { user, setCookies: [] };
    }
  }
  const refresh = readCookie(req, REFRESH_COOKIE);
  if (!refresh) return null;
  const renewed = await auth.refresh(refresh);
  if (!renewed) return null;
  return { user: renewed.user, setCookies: sessionCookies(req, renewed.session) };
}

/** Forgets a token right away (sign out), instead of after the cache window. */
export function forgetToken(accessToken: string) {
  cache.delete(accessToken);
}
