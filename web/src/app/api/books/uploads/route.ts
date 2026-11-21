import { CreateBookUploadResponse } from "@/contracts/api";
import { createBookUpload } from "@/lib/server/books";
import { ok, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

// POST /api/books/uploads — where to send one PDF before POST /api/books.
export const POST = route(async (_req: Request, _ctx, user) => ok(CreateBookUploadResponse, await createBookUpload(user), 201), {
  limit: LIMITS.bookUpload,
});
