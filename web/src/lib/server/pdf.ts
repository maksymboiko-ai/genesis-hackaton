import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 400;
export const MAX_BOOK_CHARS = 1_500_000;

/** True if the bytes start with the PDF magic number "%PDF-". */
export function isPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export class PdfLimitError extends Error {}

/**
 * Text of a PDF with a text layer, pages separated by blank lines. Throws on
 * too many pages, too much text, or no text at all (a scanned book).
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new PdfLimitError(`PDF has more than ${MAX_PDF_PAGES} pages`);
    const { text } = await extractText(pdf, { mergePages: false });
    const joined = text.join("\n\n").trim();
    if (!joined) throw new PdfLimitError("PDF has no text layer");
    if (joined.length > MAX_BOOK_CHARS) throw new PdfLimitError("PDF has too much text");
    return joined;
  } finally {
    await pdf.loadingTask.destroy().catch(() => {});
  }
}
