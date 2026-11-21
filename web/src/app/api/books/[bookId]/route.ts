import { z } from "zod";
import { GetBookResponse } from "@/contracts/api";
import { Id } from "@/contracts/domain";
import { getBook } from "@/lib/server/books";
import { ok, parseWith, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

const Params = z.object({ bookId: Id });

// GET /api/books/:bookId — poll until status is "ready" or "failed".
export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ bookId: string }> }) => {
    const { bookId } = parseWith(Params, await ctx.params);
    return ok(GetBookResponse, await getBook(bookId));
  },
  { limit: LIMITS.read },
);
