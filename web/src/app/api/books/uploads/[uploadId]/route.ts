import { z } from "zod";
import { Id } from "@/contracts/domain";
import { receiveBookUpload } from "@/lib/server/books";
import { parseWith, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

const Params = z.object({ uploadId: Id });

// PUT /api/books/uploads/:uploadId — body: the PDF. Only with STORE=memory;
// deployed, uploadUrl points at file storage and this answers 404.
export const PUT = route(
  async (req: Request, ctx: { params: Promise<{ uploadId: string }> }, user) => {
    const { uploadId } = parseWith(Params, await ctx.params);
    await receiveBookUpload(user, uploadId, req);
    return new Response(null, { status: 204 });
  },
  { limit: LIMITS.bookUpload },
);
