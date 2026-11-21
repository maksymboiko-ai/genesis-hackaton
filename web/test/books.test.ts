import { describe, expect, it } from "vitest";
import { GET as getBook } from "@/app/api/books/[bookId]/route";
import { GET as listBooks, POST as createBook } from "@/app/api/books/route";
import { PUT as receiveUpload } from "@/app/api/books/uploads/[uploadId]/route";
import { POST as reserveUpload } from "@/app/api/books/uploads/route";
import { POST as createChild } from "@/app/api/children/route";
import { POST as createCurriculum } from "@/app/api/curricula/route";
import { EMBEDDING_DIMENSIONS } from "@/contracts/ai";
import { fakeAi } from "@/lib/server/ai-fake";
import { flushBackground } from "@/lib/server/background";
import { checkPreparedBook } from "@/lib/server/books";
import { resetEnvForTests } from "@/lib/server/env";
import { extractPdfText, isPdf, MAX_PDF_BYTES } from "@/lib/server/pdf";
import { call, jsonRequest, memory, parent, signUpParent } from "./helpers";
import { makePdf } from "./pdf-fixture";

const BOOK = makePdf([
  ["Chapter 1 Fractions", "A fraction has a numerator and a denominator."],
  ["Chapter 2 Decimals", "Decimals are another way to write fractions."],
]);

// A fresh client IP per request keeps the upload rate limits out of these tests.
const ip = () => ({ "x-forwarded-for": crypto.randomUUID() });

const reserve = (headers: Record<string, string> = {}) =>
  call(reserveUpload, jsonRequest("POST", "/api/books/uploads", undefined, { ...ip(), ...headers }));

function putFile(uploadId: string, bytes: Uint8Array, headers: Record<string, string> = {}) {
  const all: Record<string, string> = { "content-type": "application/pdf", cookie: parent.cookie, ...ip(), ...headers };
  if (all.cookie === "") delete all.cookie;
  const req = new Request(`http://localhost/api/books/uploads/${uploadId}`, { method: "PUT", body: bytes as BodyInit, headers: all });
  return call(receiveUpload, req, { uploadId });
}

const create = (body: unknown, headers: Record<string, string> = {}) =>
  call(createBook, jsonRequest("POST", "/api/books", body, { ...ip(), ...headers }));

/** The whole upload as the browser does it: reserve, send the file, create the book. */
async function upload(title: string, bytes: Uint8Array = BOOK) {
  const { uploadId } = (await reserve()).body;
  await putFile(uploadId, bytes);
  return create({ title, uploadId });
}

const quiet = async <T>(fn: () => Promise<T>) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

describe("pdf", () => {
  it("detects the magic number and extracts text", async () => {
    expect(isPdf(BOOK)).toBe(true);
    expect(isPdf(new TextEncoder().encode("<html>"))).toBe(false);
    const text = await extractPdfText(BOOK);
    expect(text).toContain("Chapter 1 Fractions");
    expect(text).toContain("Decimals are another way");
  });

  it("rejects a PDF without text", async () => {
    await expect(extractPdfText(makePdf([[]]))).rejects.toThrow(/no text/);
  });
});

describe("uploading a book", () => {
  it("reserves an upload, takes the file, responds processing, then becomes ready", async () => {
    const reserved = await reserve();
    expect(reserved.status).toBe(201);
    const { uploadId, uploadUrl } = reserved.body;
    expect(uploadUrl).toBe(`/api/books/uploads/${uploadId}`);
    expect((await putFile(uploadId, BOOK)).status).toBe(204);

    const res = await create({ title: " Math book ", uploadId });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), title: "Math book", status: "processing" });

    // A server path: the owner and the upload id, nothing from the client.
    expect([...memory().data.files.keys()]).toEqual([`books/${parent.user.id}/${uploadId}.pdf`]);

    await flushBackground();
    const got = await call(getBook, jsonRequest("GET", "/x"), { bookId: res.body.id });
    expect(got.body.status).toBe("ready");
    const book = memory().data.books[0];
    expect((book.sections as unknown[]).length).toBeGreaterThan(0);
    expect(memory().data.chunks.length).toBeGreaterThan(0);
    expect(memory().data.chunks.every((c) => c.embedding.length === EMBEDDING_DIMENSIONS)).toBe(true);

    const list = await call(listBooks, jsonRequest("GET", "/api/books"));
    expect(list.body.books).toEqual([got.body]);
  });

  it("rejects a file that is not a PDF and removes it", async () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect((await upload("x", html)).status).toBe(415);
    expect(memory().data.books).toHaveLength(0);
    expect(memory().data.files.size).toBe(0);
  });

  it("rejects an empty or oversize file and removes it", async () => {
    expect((await upload("x", new Uint8Array())).status).toBe(400);
    // Straight into storage, as a browser PUT to a signed URL would be.
    const { uploadId } = (await reserve()).body;
    memory().data.files.set(`books/${parent.user.id}/${uploadId}.pdf`, new Uint8Array(MAX_PDF_BYTES + 1));
    expect((await create({ title: "x", uploadId })).status).toBe(413);
    expect(memory().data.books).toHaveLength(0);
    expect(memory().data.files.size).toBe(0);
  });

  it("validates fields and content type, and needs the file first", async () => {
    const { uploadId } = (await reserve()).body;
    expect((await create({ title: "x", uploadId })).status).toBe(400);
    await putFile(uploadId, BOOK);
    expect((await create({ uploadId })).status).toBe(400);
    expect((await create({ title: "  ", uploadId })).status).toBe(400);
    expect((await create({ title: "x".repeat(201), uploadId })).status).toBe(400);
    expect((await create({ title: "x" })).status).toBe(400);
    expect((await create({ title: "x", uploadId: "../../etc/passwd" })).status).toBe(400);
    const f = new FormData();
    f.set("title", "x");
    const multipart = new Request("http://localhost/api/books", { method: "POST", body: f, headers: { ...ip(), cookie: parent.cookie } });
    expect((await call(createBook, multipart)).status).toBe(415);
    expect(memory().data.books).toHaveLength(0);
    // None of that cost the parent their upload.
    expect((await create({ title: "x", uploadId })).status).toBe(201);
  });

  it("the upload route takes one file of at most 20 MB per upload id", async () => {
    const { uploadId } = (await reserve()).body;
    expect((await putFile("x", BOOK)).status).toBe(400);
    expect((await putFile(uploadId, BOOK, { "content-length": String(30 * 1024 * 1024) })).status).toBe(413);
    expect((await putFile(uploadId, new Uint8Array(MAX_PDF_BYTES + 1))).status).toBe(413);
    expect((await putFile(uploadId, BOOK, { cookie: "" })).status).toBe(401);
    expect(memory().data.files.size).toBe(0);
    expect((await putFile(uploadId, BOOK)).status).toBe(204);
    expect((await putFile(uploadId, BOOK)).status).toBe(409);
  });

  it("the upload route answers 404 when files go straight to storage", async () => {
    const { uploadId } = (await reserve()).body;
    Object.assign(process.env, { STORE: "supabase", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x".repeat(20) });
    resetEnvForTests();
    try {
      expect((await putFile(uploadId, BOOK)).status).toBe(404);
      expect(memory().data.files.size).toBe(0);
    } finally {
      process.env.STORE = "memory";
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      resetEnvForTests();
    }
  });

  it("an upload id only works for the parent who reserved it", async () => {
    const { uploadId } = (await reserve()).body;
    await putFile(uploadId, BOOK);
    const b = await signUpParent("b@example.com", "B");
    expect((await create({ title: "x", uploadId }, { cookie: b.cookie })).status).toBe(400);
    expect(memory().data.books).toHaveLength(0);
    expect(memory().data.files.size).toBe(1);
  });

  it("a PDF without text ends as failed, with no chunks left", () =>
    quiet(async () => {
      const res = await upload("Scan", makePdf([[]]));
      expect(res.status).toBe(201);
      await flushBackground();
      expect((await call(getBook, jsonRequest("GET", "/x"), { bookId: res.body.id })).body.status).toBe("failed");
      expect(memory().data.chunks).toHaveLength(0);
    }));

  it("a bad prepared book (wrong vector size) ends as failed", () =>
    quiet(async () => {
      const original = fakeAi.prepareBook;
      fakeAi.prepareBook = async () => ({
        sections: [{ index: 0, chapter: "", title: "A", summary: "" }],
        chunks: [{ content: "x", sectionIndex: 0, embedding: [1, 2, 3] }],
      });
      try {
        const res = await upload("B");
        await flushBackground();
        expect(memory().data.books.find((b) => b.id === res.body.id)!.status).toBe("failed");
      } finally {
        fakeAi.prepareBook = original;
      }
    }));

  it("books and uploads are rate-limited per IP", async () => {
    const books: number[] = [];
    for (let i = 0; i < 7; i++) books.push((await create({ title: "x", uploadId: crypto.randomUUID() }, { "x-forwarded-for": "same" })).status);
    expect(books.slice(-1)[0]).toBe(429);
    const uploads: number[] = [];
    for (let i = 0; i < 12; i++) uploads.push((await reserve({ "x-forwarded-for": "same" })).status);
    expect(uploads.slice(-1)[0]).toBe(429);
  });

  it("bad id → 400, unknown → 404", async () => {
    expect((await call(getBook, jsonRequest("GET", "/x"), { bookId: "x" })).status).toBe(400);
    expect((await call(getBook, jsonRequest("GET", "/x"), { bookId: crypto.randomUUID() })).status).toBe(404);
  });

  it("end to end: a curriculum from the uploaded book uses its sections", async () => {
    const up = await upload("Math");
    await flushBackground();
    const child = await call(createChild, jsonRequest("POST", "/api/children", { name: "Mia", gradeLevel: 5 }));
    const cur = await call(
      createCurriculum,
      jsonRequest("POST", "/api/curricula", { childId: child.body.id, prompt: "fractions for fifth grade", bookId: up.body.id, clarifications: [] }),
    );
    expect(cur.status).toBe(201);
    await flushBackground();
    const lessons = memory().data.lessons;
    expect(lessons.every((l) => l.bookSectionIndex !== null)).toBe(true);
    const first = lessons.find((l) => l.position === 0)!;
    expect((first.content as { bodyMarkdown: string }).bodyMarkdown).toContain("From the book");
  });
});

describe("checkPreparedBook", () => {
  const vec = () => new Array(EMBEDDING_DIMENSIONS).fill(0.1);
  it("rejects chunks pointing at unknown sections and non-sequential indexes", () => {
    expect(() =>
      checkPreparedBook({ sections: [{ index: 0, chapter: "", title: "A", summary: "" }], chunks: [{ content: "x", sectionIndex: 3, embedding: vec() }] }),
    ).toThrow(/unknown section/);
    expect(() =>
      checkPreparedBook({ sections: [{ index: 1, chapter: "", title: "A", summary: "" }], chunks: [{ content: "x", sectionIndex: 0, embedding: vec() }] }),
    ).toThrow(/0..n-1/);
  });
  it("cleans text and numbers chunks in reading order", () => {
    const out = checkPreparedBook({
      sections: [{ index: 0, chapter: "", title: "", summary: "s" }],
      chunks: [
        { content: "a\u0000b", sectionIndex: 0, embedding: vec() },
        { content: "c", sectionIndex: 0, embedding: vec() },
      ],
    });
    expect(out.sections[0].title).toBe("Section 1");
    expect(out.chunks.map((c) => [c.chunkIndex, c.content])).toEqual([[0, "ab"], [1, "c"]]);
  });
});
