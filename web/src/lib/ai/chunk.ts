// Splits book text into overlapping chunks for embedding. Pure code, no
// model call.

// About 300 tokens: small enough that 6 chunks fit easily in a prompt, large
// enough to hold a worked example.
const CHUNK_CHARS = 1200;
// The tail of each chunk is repeated at the start of the next, so a sentence
// cut by a boundary is whole in one of them.
const OVERLAP_CHARS = 150;

// Break points, best first: paragraph, line, sentence, word.
const SEPARATORS = ["\n\n", "\n", ". ", " "];

function splitToFit(text: string, separators: string[]): string[] {
  if (text.length <= CHUNK_CHARS) return [text];
  const [separator, ...rest] = separators;
  if (separator === undefined) {
    const pieces: string[] = [];
    for (let i = 0; i < text.length; i += CHUNK_CHARS) {
      pieces.push(text.slice(i, i + CHUNK_CHARS));
    }
    return pieces;
  }
  return text
    .split(separator)
    .flatMap((part, index, parts) =>
      splitToFit(index < parts.length - 1 ? part + separator : part, rest),
    );
}

export function chunkText(text: string): string[] {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let current = "";
  for (const piece of splitToFit(normalized, SEPARATORS)) {
    if (current && current.length + piece.length > CHUNK_CHARS) {
      chunks.push(current.trim());
      current = current.slice(-OVERLAP_CHARS);
    }
    current += piece;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
