import { CreateBookResponse, ListBooksResponse } from "@/contracts/api";
import { listBooks, uploadBook } from "@/lib/server/books";
import { ok, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

// Ingestion (text extraction, book map, embeddings) runs in after() within
// this budget. 60 s works on every Vercel plan; raise it (up to 300) when the
// project has Fluid compute, or ingest large books with a local script.
export const maxDuration = 60;

// POST /api/books — multipart/form-data: title, file (PDF)
export const POST = route(async (req: Request) => ok(CreateBookResponse, await uploadBook(req), 201), {
  limit: LIMITS.book,
});

// GET /api/books
export const GET = route(async () => ok(ListBooksResponse, { books: await listBooks() }), { limit: LIMITS.read });
