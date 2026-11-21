import "server-only";
import type { ApiError } from "@/contracts/api";

type Code = ApiError["error"]["code"];

// Errors a service may throw on purpose. Anything else becomes a generic 500.
export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 413 | 415 | 429 | 502 | 503,
    public readonly code: Code,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message = "The request is not valid.") =>
  new HttpError(400, "bad_request", message);
export const notFound = (what = "Resource") => new HttpError(404, "not_found", `${what} not found.`);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
// The ApiError enum has no codes for these statuses, so they use bad_request.
export const tooLarge = (message = "The request body is too large.") =>
  new HttpError(413, "bad_request", message);
export const unsupported = (message = "Unsupported media type.") =>
  new HttpError(415, "bad_request", message);
export const tooMany = (message = "Too many requests. Try again in a minute.") =>
  new HttpError(429, "bad_request", message);
// A model call failed after its retry. Safe message only.
export const upstream = (message = "The AI service failed. Try again.") =>
  new HttpError(502, "internal", message);
