import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ApiError } from "@/contracts/api";
import { authenticate, type AuthUser } from "./auth";
import { HttpError, badRequest, crossSite, tooLarge, unauthorized, unsupported } from "./errors";
import { rateLimit, type RateLimitRule } from "./rate-limit";

export const MAX_JSON_BYTES = 64 * 1024;

function errorBody(code: ApiError["error"]["code"], message: string): ApiError {
  return { error: { code, message } };
}

export function errorResponse(err: unknown, req: Request): Response {
  if (err instanceof HttpError) {
    return NextResponse.json(errorBody(err.code, err.message), { status: err.status });
  }
  const ref = crypto.randomUUID().slice(0, 8);
  // Detail goes to the server log only. Never log request bodies: they hold
  // children's names, notes and prompts.
  console.error("[api] %s %s %s", ref, req.method, new URL(req.url).pathname, err);
  return NextResponse.json(errorBody("internal", `Something went wrong (ref ${ref}).`), {
    status: 500,
  });
}

export function clientIp(req: Request): string {
  // On Vercel the first x-forwarded-for entry is the client address.
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;
type AuthedHandler<C> = (req: Request, ctx: C, user: AuthUser) => Promise<Response>;

type RouteOptions = {
  // Applied per client IP before the handler runs.
  limit?: RateLimitRule;
};

/**
 * State-changing requests must come from our own pages. The session cookies
 * are SameSite=Lax already; this also refuses a cross-site Origin outright.
 */
function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw crossSite();
  }
  if (originHost !== host) throw crossSite();
}

function wrap<C>(run: (req: Request, ctx: C) => Promise<Response>, options: RouteOptions): Handler<C> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      if (options.limit) rateLimit(`${options.limit.name}:${clientIp(req)}`, options.limit);
      const res = await run(req, ctx);
      res.headers.set("Cache-Control", "no-store");
      return res;
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}

/**
 * A route that needs a signed-in parent: rate limit, session check (with
 * token refresh), error mapping to the ApiError envelope, no internals in
 * responses. Reading the request headers also keeps every GET handler
 * dynamic under Cache Components.
 */
export function route<C>(handler: AuthedHandler<C>, options: RouteOptions = {}): Handler<C> {
  return wrap(async (req, ctx) => {
    const session = await authenticate(req);
    if (!session) throw unauthorized();
    const res = await handler(req, ctx, session.user);
    for (const c of session.setCookies) res.headers.append("Set-Cookie", c);
    return res;
  }, options);
}

/** A route open without a session (health, sign up, sign in, sign out). */
export function publicRoute<C>(handler: Handler<C>, options: RouteOptions = {}): Handler<C> {
  return wrap(handler, options);
}

/** Validates any unknown value (params, query, form fields) against a schema. */
export function parseWith<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    // Field paths only; submitted values are never echoed back.
    const fields = result.error.issues.map((i) => i.path.join(".") || "(root)");
    throw badRequest(`Invalid fields: ${[...new Set(fields)].join(", ")}.`);
  }
  return result.data;
}

/** Reads a JSON body with a size cap and validates it. */
export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const type = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.startsWith("application/json")) throw unsupported("Expected application/json.");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) throw tooLarge();

  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) throw tooLarge();

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw badRequest("Malformed JSON.");
  }
  return parseWith(schema, raw);
}

/** Query string as a plain object, for parseWith. */
export function queryOf(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}

/** Serializes through the contract schema, so nothing outside it can leak. */
export function ok<T extends z.ZodType>(schema: T, data: z.input<T>, status = 200): Response {
  return NextResponse.json(schema.parse(data), { status });
}
