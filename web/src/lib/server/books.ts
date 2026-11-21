import "server-only";
import type { PreparedBook } from "@/contracts/ai";
import type { CreateBookRequest, CreateBookUploadResponse } from "@/contracts/api";
import type { Book, BookSection } from "@/contracts/domain";
import { ownedBook } from "./access";
import { getAi } from "./ai";
import type { AuthUser } from "./auth";
import { runInBackground } from "./background";
import { getEnv } from "./env";
import { type HttpError, badRequest, conflict, notFound, tooLarge, unsupported } from "./errors";
import { extractPdfText, isPdf, MAX_PDF_BYTES } from "./pdf";
import { assertEmbedding } from "./retrieval";
import { getStore } from "./store";
import type { BookRow } from "./store/types";
import { cleanText } from "./text";

export const MAX_CHUNKS = 1500;
const MAX_SECTIONS = 300;
const MAX_CHUNK_CHARS = 4000;

const toBook = (row: BookRow): Book => ({ id: row.id, title: row.title, status: row.status });

// Server-generated path: the client file name never reaches storage, and the
// owner's id in it means an upload id only works for the parent who got it.
const uploadPath = (user: AuthUser, uploadId: string) => `books/${user.id}/${uploadId}.pdf`;

/** POST /books/uploads: picks where one PDF will be stored and says where to send it. */
export async function createBookUpload(user: AuthUser): Promise<CreateBookUploadResponse> {
  const uploadId = crypto.randomUUID();
  const direct = await getStore().createUploadUrl(uploadPath(user, uploadId));
  return { uploadId, uploadUrl: direct ?? `/api/books/uploads/${uploadId}` };
}

/**
 * PUT /books/uploads/:uploadId: takes the file itself when the store has no
 * direct uploads (local runs without a database, tests). Deployed, the browser
 * sends the file straight to storage and this answers 404.
 */
export async function receiveBookUpload(user: AuthUser, uploadId: string, req: Request): Promise<void> {
  if (getEnv().STORE !== "memory") throw notFound("Upload");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_PDF_BYTES) throw tooLarge("The PDF must be 20 MB or less.");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_PDF_BYTES) throw tooLarge("The PDF must be 20 MB or less.");

  const store = getStore();
  const path = uploadPath(user, uploadId);
  if ((await store.fileSize(path)) !== null) throw conflict("This upload already has a file.");
  await store.uploadFile(path, bytes, "application/pdf");
}

/** POST /books: checks the uploaded PDF, responds, ingests in the background. */
export async function createBook(user: AuthUser, input: CreateBookRequest): Promise<Book> {
  const store = getStore();
  const storagePath = uploadPath(user, input.uploadId);
  const size = await store.fileSize(storagePath);
  if (size === null) throw badRequest("Upload the file first.");

  // The browser sent the file to storage itself, so nothing about it is
  // trusted until checked here. A rejected file does not stay in storage.
  const reject = async (err: HttpError) => {
    await store.removeFile(storagePath).catch((e) => console.error("[books] could not remove a rejected upload", e));
    return err;
  };
  if (size === 0) throw await reject(badRequest("The file is empty."));
  if (size > MAX_PDF_BYTES) throw await reject(tooLarge("The PDF must be 20 MB or less."));
  // The MIME type is chosen by the client; the magic number is not.
  if (!isPdf(await store.downloadFile(storagePath))) throw await reject(unsupported("Only PDF files are supported."));

  const book = await store.createBook({ ownerId: user.id, title: cleanText(input.title, 200), storagePath });
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

/** The signed-in parent's books. */
export async function listBooks(user: AuthUser): Promise<Book[]> {
  return (await getStore().listBooks(user.id)).map(toBook);
}

export async function getBook(user: AuthUser, id: string): Promise<Book> {
  return toBook(await ownedBook(user, id));
}
