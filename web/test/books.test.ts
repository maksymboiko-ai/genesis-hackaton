import { describe, expect, it } from "vitest";
import { GET as getBook } from "@/app/api/books/[bookId]/route";
import { GET as listBooks, POST as uploadBook } from "@/app/api/books/route";
import { POST as createChild } from "@/app/api/children/route";
import { POST as createCurriculum } from "@/app/api/curricula/route";
import { EMBEDDING_DIMENSIONS } from "@/contracts/ai";
import { fakeAi } from "@/lib/server/ai-fake";
import { flushBackground } from "@/lib/server/background";
import { checkPreparedBook } from "@/lib/server/books";
import { extractPdfText, isPdf } from "@/lib/server/pdf";
import { call, jsonRequest, memory, parent } from "./helpers";
import { makePdf } from "./pdf-fixture";

const BOOK = makePdf([
  ["Chapter 1 Fractions", "A fraction has a numerator and a denominator."],
  ["Chapter 2 Decimals", "Decimals are another way to write fractions."],
]);

function form(fields: { title?: string; file?: Blob; name?: string }) {
  const f = new FormData();
  if (fields.title !== undefined) f.set("title", fields.title);
  if (fields.file) f.set("file", fields.file, fields.name ?? "book.pdf");
  // A fresh client IP per request keeps the upload rate limit out of these tests.
  return new Request("http://localhost/api/books", { method: "POST", body: f, headers: { "x-forwarded-for": crypto.randomUUID(), cookie: parent.cookie } });
}

const pdfBlob = (bytes: Uint8Array = BOOK, type = "application/pdf") => new Blob([bytes as BlobPart], { type });
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

describe("POST /api/books", () => {
  it("stores the file under a server path, responds processing, then becomes ready", async () => {
    const res = await call(uploadBook, form({ title: " Math book ", file: pdfBlob(), name: "../../etc/passwd.pdf" }));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), title: "Math book", status: "processing" });

    const [path] = [...memory().data.files.keys()];
    expect(path).toMatch(/^books\/[0-9a-f-]{36}\.pdf$/);

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

  it("rejects non-PDFs even with a PDF name or MIME type", async () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect((await call(uploadBook, form({ title: "x", file: pdfBlob(html), name: "a.pdf" }))).status).toBe(415);
    expect((await call(uploadBook, form({ title: "x", file: pdfBlob(BOOK, "text/plain") }))).status).toBe(415);
    expect(memory().data.books).toHaveLength(0);
    expect(memory().data.files.size).toBe(0);
  });

  it("validates fields, content type and size", async () => {
    expect((await call(uploadBook, form({ file: pdfBlob() }))).status).toBe(400);
    expect((await call(uploadBook, form({ title: "x".repeat(201), file: pdfBlob() }))).status).toBe(400);
    expect((await call(uploadBook, form({ title: "x" }))).status).toBe(400);
    expect((await call(uploadBook, form({ title: "x", file: pdfBlob(new Uint8Array()) }))).status).toBe(400);
    expect((await call(uploadBook, jsonRequest("POST", "/api/books", { title: "x" }, { "x-forwarded-for": "json" }))).status).toBe(415);
    const big = new Request("http://localhost/api/books", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(30 * 1024 * 1024), "x-forwarded-for": "big", cookie: parent.cookie },
      body: "--x--",
    });
    expect((await call(uploadBook, big)).status).toBe(413);
  });

  it("a PDF without text ends as failed, with no chunks left", () =>
    quiet(async () => {
      const res = await call(uploadBook, form({ title: "Scan", file: pdfBlob(makePdf([[]])) }));
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
        const res = await call(uploadBook, form({ title: "B", file: pdfBlob() }));
        await flushBackground();
        expect(memory().data.books.find((b) => b.id === res.body.id)!.status).toBe("failed");
      } finally {
        fakeAi.prepareBook = original;
      }
    }));

  it("uploads are rate-limited per IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const f = new FormData();
      f.set("title", "x");
      statuses.push((await call(uploadBook, new Request("http://localhost/api/books", { method: "POST", body: f, headers: { "x-forwarded-for": "same", cookie: parent.cookie } }))).status);
    }
    expect(statuses.slice(-1)[0]).toBe(429);
  });

  it("bad id → 400, unknown → 404", async () => {
    expect((await call(getBook, jsonRequest("GET", "/x"), { bookId: "x" })).status).toBe(400);
    expect((await call(getBook, jsonRequest("GET", "/x"), { bookId: crypto.randomUUID() })).status).toBe(404);
  });

  it("end to end: a curriculum from the uploaded book uses its sections", async () => {
    const up = await call(uploadBook, form({ title: "Math", file: pdfBlob() }));
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
