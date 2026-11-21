import { z } from "zod";
import { CreateBookRequest, CreateBookResponse, ListBooksResponse } from "@/contracts/api";
import { createBook, listBooks } from "@/lib/server/books";
import { ok, parseJson, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

// Ingestion (text extraction, book map, embeddings) runs in after() within
// this budget. 60 s works on every Vercel plan; raise it (up to 300) when the
// project has Fluid compute, or ingest large books with a local script.
export const maxDuration = 60;

// POST /api/books — the file is already in storage (see POST /api/books/uploads).
export const POST = route(
  async (req: Request, _ctx, user) => {
    const body = await parseJson(req, CreateBookRequest.extend({ title: z.string().trim().min(1).max(200) }));
    return ok(CreateBookResponse, await createBook(user, body), 201);
  },
  { limit: LIMITS.book },
);

// GET /api/books
export const GET = route(async (_req, _ctx, user) => ok(ListBooksResponse, { books: await listBooks(user) }), {
  limit: LIMITS.read,
});
