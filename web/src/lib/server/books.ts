import "server-only";
import { z } from "zod";
import type { PreparedBook } from "@/contracts/ai";
import type { Book, BookSection } from "@/contracts/domain";
import { getAi } from "./ai";
import { runInBackground } from "./background";
import { badRequest, notFound, tooLarge, unsupported } from "./errors";
import { parseWith } from "./http";
import { extractPdfText, isPdf, MAX_PDF_BYTES } from "./pdf";
import { assertEmbedding } from "./retrieval";
import { getStore } from "./store";
import type { BookRow } from "./store/types";
import { cleanText } from "./text";

export const MAX_CHUNKS = 1500;
const MAX_SECTIONS = 300;
const MAX_CHUNK_CHARS = 4000;
// Multipart overhead allowed on top of the file itself.
const FORM_OVERHEAD = 64 * 1024;

const toBook = (row: BookRow): Book => ({ id: row.id, title: row.title, status: row.status });

const Fields = z.object({ title: z.string().trim().min(1).max(200) });

/** POST /books: validates and stores the PDF, responds, ingests in the background. */
export async function uploadBook(req: Request): Promise<Book> {
  const type = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.startsWith("multipart/form-data")) throw unsupported("Expected multipart/form-data.");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_PDF_BYTES + FORM_OVERHEAD) throw tooLarge("The PDF must be 20 MB or less.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Malformed form data.");
  }
  const { title } = parseWith(Fields, { title: form.get("title") });
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Invalid fields: file.");
  if (file.size === 0) throw badRequest("The file is empty.");
  if (file.size > MAX_PDF_BYTES) throw tooLarge("The PDF must be 20 MB or less.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  // The MIME type is chosen by the client; the magic number is not.
  if (file.type !== "application/pdf" || !isPdf(bytes)) throw unsupported("Only PDF files are supported.");

  const store = getStore();
  // Server-generated path: the client file name never reaches storage.
  const storagePath = `books/${crypto.randomUUID()}.pdf`;
  await store.uploadFile(storagePath, bytes, "application/pdf");
  const book = await store.createBook({ title: cleanText(title, 200), storagePath });
  runInBackground(`book ${book.id}`, () => ingestBook(book.id));
  return toBook(book);
}

/** Bounds and checks the AI module's prepared book before it is stored. */
export function checkPreparedBook(prepared: PreparedBook) {
  const sections: BookSection[] = prepared.sections.slice(0, MAX_SECTIONS).map((s, index) => ({
    index,
    chapter: cleanText(s.chapter, 200),
    title: cleanText(s.title, 200) || `Section ${index + 1}`,
    summary: cleanText(s.summary, 1000),
  }));
  if (sections.length === 0) throw new Error("prepared book has no sections");
  if (prepared.sections.some((s, i) => s.index !== i)) throw new Error("section indexes are not 0..n-1");
  if (prepared.chunks.length === 0) throw new Error("prepared book has no chunks");
  if (prepared.chunks.length > MAX_CHUNKS) throw new Error("prepared book has too many chunks");

  const chunks = prepared.chunks.map((c, chunkIndex) => {
    if (!Number.isInteger(c.sectionIndex) || c.sectionIndex < 0 || c.sectionIndex >= sections.length) {
      throw new Error("chunk points at an unknown section");
    }
    assertEmbedding(c.embedding);
    return { chunkIndex, content: cleanText(c.content, MAX_CHUNK_CHARS), sectionIndex: c.sectionIndex, embedding: c.embedding };
  });
  return { sections, chunks: chunks.filter((c) => c.content) };
}

/** The ingestion job. Any error marks the book failed. */
export async function ingestBook(bookId: string): Promise<void> {
  const store = getStore();
  try {
    const book = await store.getBook(bookId);
    if (!book || book.status !== "processing") return;
    const text = await extractPdfText(await store.downloadFile(book.storagePath));
    const prepared = await getAi().prepareBook({ title: book.title, text });
    const { sections, chunks } = checkPreparedBook(prepared);
    await store.completeBook(bookId, sections, chunks);
  } catch (err) {
    await store.failBook(bookId).catch(() => {});
    throw err;
  }
}

export async function listBooks(): Promise<Book[]> {
  return (await getStore().listBooks()).map(toBook);
}

export async function getBook(id: string): Promise<Book> {
  const book = await getStore().getBook(id);
  if (!book) throw notFound("Book");
  return toBook(book);
}
