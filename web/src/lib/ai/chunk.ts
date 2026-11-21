// Splits book text into chunks for embedding. Pure code, no model call.
//
// The text is first cut at headings, so a chunk never runs from one topic
// into the next, and then by size inside each of those blocks.

// About 300 tokens: small enough that LESSON_CHUNK_LIMIT chunks fit easily in
// a prompt, large enough to hold a worked example.
const CHUNK_CHARS = 1200;
// The tail of each chunk is repeated at the start of the next one in the same
// block, so a sentence cut by a boundary is whole in one of them.
const OVERLAP_CHARS = 150;
// A block shorter than this (a chapter title directly above a section title)
// is joined to the block after it rather than becoming a chunk of its own.
const MIN_BLOCK_CHARS = 200;
const MAX_HEADING_CHARS = 80;

// Break points inside a block, best first: paragraph, line, sentence, word.
const SEPARATORS = ["\n\n", "\n", ". ", " "];

const NAMED_HEADING = /^(chapter|unit|lesson|section|part|module)\s+\d+\b/i;
// "4.2 Undoing operations", "12 Ratios". A trailing full stop means a
// sentence or a list item ("1. Take 4 from both pans."), not a heading.
const NUMBERED_HEADING = /^\d+(\.\d+)*\.?\s+[A-Z][^.!?]*$/;
const MARKDOWN_HEADING = /^#{1,6}\s+\S/;

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > MAX_HEADING_CHARS) return false;
  return (
    NAMED_HEADING.test(trimmed) ||
    NUMBERED_HEADING.test(trimmed) ||
    MARKDOWN_HEADING.test(trimmed)
  );
}

// Cuts the text into blocks that each start at a heading.
function splitAtHeadings(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const block = current.join("\n").trim();
    if (block) blocks.push(block);
    current = [];
  };
  for (const line of text.split("\n")) {
    const blockHasBody = current.join("\n").trim().length >= MIN_BLOCK_CHARS;
    if (isHeading(line) && blockHasBody) flush();
    current.push(line);
  }
  flush();
  return blocks;
}

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

function chunkBlock(block: string): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const piece of splitToFit(block, SEPARATORS)) {
    if (current && current.length + piece.length > CHUNK_CHARS) {
      chunks.push(current.trim());
      current = current.slice(-OVERLAP_CHARS);
    }
    current += piece;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function chunkText(text: string): string[] {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return [];
  return splitAtHeadings(normalized).flatMap(chunkBlock);
}
