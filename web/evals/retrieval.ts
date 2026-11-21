// Retrieval eval. Prepares the fixture book through the production
// prepareBook, then checks whether a whole-book search for each labelled
// query brings back a chunk from the right section. This is the path a
// lesson with no section takes (remedial and extension lessons); a lesson
// with a section is filtered to it and cannot miss.
//
// Runs in memory with the same cosine ranking as match_book_chunks, so it
// needs no database.
//
//   npm run evals:rag
import { aiService } from "@/lib/ai";
import { BOOK_TEXT, BOOK_TITLE, RETRIEVAL_QUERIES } from "./fixtures/book";

// Topics the book does not cover. Their best match should score clearly
// below the labelled queries', which is what a similarity cutoff relies on.
const OFF_BOOK_QUERIES = [
  "Photosynthesis. Explain how plants make food from sunlight.",
  "The causes of the American Revolution.",
  "Finding the area of a circle using pi.",
  "Identifying nouns and verbs in a sentence.",
];

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / Math.sqrt(normA * normB);
}

type Ranked = { sectionIndex: number; similarity: number }[];

function rank(query: number[], chunks: { sectionIndex: number; embedding: number[] }[]): Ranked {
  return chunks
    .map((chunk) => ({ sectionIndex: chunk.sectionIndex, similarity: cosine(query, chunk.embedding) }))
    .sort((a, b) => b.similarity - a.similarity);
}

function score(rankings: Ranked[], expected: number[]) {
  const ranks = rankings.map((ranking, i) => ranking.findIndex((r) => r.sectionIndex === expected[i]) + 1);
  const hitAt = (k: number) => `${ranks.filter((r) => r >= 1 && r <= k).length}/${ranks.length}`;
  const mrr = ranks.reduce((total, r) => total + (r ? 1 / r : 0), 0) / ranks.length;
  return { "hit@1": hitAt(1), "hit@3": hitAt(3), mrr: +mrr.toFixed(3), ranks };
}

async function main() {
  const book = await aiService.prepareBook({ title: BOOK_TITLE, text: BOOK_TEXT });
  console.log(`${book.chunks.length} chunks in ${book.sections.length} sections:`);
  for (const section of book.sections) {
    const count = book.chunks.filter((c) => c.sectionIndex === section.index).length;
    console.log(`  [${section.index}] ${section.chapter} > ${section.title} (${count} chunks)`);
  }

  const expected = RETRIEVAL_QUERIES.map(({ section }) => {
    const name = section.slice(4).toLowerCase();
    const found = book.sections.find((s) => s.title.toLowerCase().includes(name));
    if (!found) throw new Error(`The book map has no section "${section}"`);
    return found.index;
  });

  const [queryVectors, offBookVectors, plainVectors] = await Promise.all([
    aiService.embed(RETRIEVAL_QUERIES.map((q) => q.query)),
    aiService.embed(OFF_BOOK_QUERIES),
    // Baseline: the same chunks embedded without their heading path.
    aiService.embed(book.chunks.map((c) => c.content)),
  ]);
  const plainChunks = book.chunks.map((chunk, i) => ({ ...chunk, embedding: plainVectors[i] }));

  const withHeadings = score(queryVectors.map((q) => rank(q, book.chunks)), expected);
  const plain = score(queryVectors.map((q) => rank(q, plainChunks)), expected);
  console.log(`\nWhole-book search, ${RETRIEVAL_QUERIES.length} labelled queries:`);
  console.table(
    {
      "chunks embedded with heading path (production)": withHeadings,
      "chunks embedded alone (baseline)": plain,
    },
    ["hit@1", "hit@3", "mrr"],
  );
  RETRIEVAL_QUERIES.forEach((q, i) => {
    if (withHeadings.ranks[i] !== 1) {
      console.log(`  rank ${withHeadings.ranks[i] || "none"} for "${q.query}" (expected ${q.section})`);
    }
  });

  const best = (vectors: number[][]) => vectors.map((v) => rank(v, book.chunks)[0].similarity);
  const inBook = best(queryVectors);
  const offBook = best(offBookVectors);
  console.log("\nBest-match similarity:");
  console.table({
    "labelled queries": { min: +Math.min(...inBook).toFixed(3), max: +Math.max(...inBook).toFixed(3) },
    "off-book queries": { min: +Math.min(...offBook).toFixed(3), max: +Math.max(...offBook).toFixed(3) },
  });
  const separable = Math.max(...offBook) < Math.min(...inBook);
  console.log(
    separable
      ? `A cutoff between ${Math.max(...offBook).toFixed(2)} and ${Math.min(...inBook).toFixed(2)} separates them.`
      : "The ranges overlap: no similarity cutoff separates on-book from off-book queries.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
