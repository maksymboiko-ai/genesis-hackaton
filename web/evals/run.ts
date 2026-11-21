// Runs every eval case against each candidate model through the production
// AiService and prints a comparison.
//
//   npm run evals                          default models from lib/ai/models.ts
//   npm run evals -- model/a model/b       compare specific OpenRouter models
//   npm run evals -- --only=replan ...     only cases whose name contains "replan"
import { mkdirSync, writeFileSync } from "node:fs";
import type { LlmCallRecord } from "@/contracts/ai";
import { aiService } from "@/lib/ai";
import { chunkText } from "@/lib/ai/chunk";
import { CASES, type EvalCase } from "./cases";

const CONCURRENCY = 6;

type CaseResult = {
  name: string;
  task: EvalCase["task"];
  passed: boolean;
  // Checks that failed, or the error when the function threw.
  failures: string[];
  threw: boolean;
  calls: LlmCallRecord[];
};

async function runCase(evalCase: EvalCase, model: string | undefined): Promise<CaseResult> {
  const calls: LlmCallRecord[] = [];
  const options = { model, onCall: (record: LlmCallRecord) => calls.push(record) };
  try {
    const failures = await evalCase.run(aiService, options);
    return { name: evalCase.name, task: evalCase.task, passed: !failures.length, failures, threw: false, calls };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name: evalCase.name, task: evalCase.task, passed: false, failures: [message], threw: true, calls };
  }
}

async function runAll(cases: EvalCase[], model: string | undefined): Promise<CaseResult[]> {
  const results: CaseResult[] = new Array(cases.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < cases.length) {
        const index = next++;
        results[index] = await runCase(cases[index], model);
      }
    }),
  );
  return results;
}

function summarize(model: string, results: CaseResult[]) {
  const calls = results.flatMap((r) => r.calls);
  const sum = (pick: (c: LlmCallRecord) => number | null) =>
    calls.reduce((total, call) => total + (pick(call) ?? 0), 0);
  return {
    model,
    passed: `${results.filter((r) => r.passed).length}/${results.length}`,
    threw: results.filter((r) => r.threw).length,
    retries: calls.length - results.length,
    avgLatencyS: +(sum((c) => c.latencyMs) / Math.max(calls.length, 1) / 1000).toFixed(1),
    inputTokens: sum((c) => c.inputTokens),
    outputTokens: sum((c) => c.outputTokens),
  };
}

// Deterministic checks of the RAG helpers; run once, not per model.
async function checkRagHelpers(): Promise<string[]> {
  const failures: string[] = [];
  const paragraph = "Fractions name equal parts of a whole. ".repeat(12).trim();
  const chunks = chunkText(Array.from({ length: 12 }, () => paragraph).join("\n\n"));
  if (chunks.length < 2) failures.push("chunkText: long text was not split");
  if (chunks.some((chunk) => chunk.length > 1400)) failures.push("chunkText: chunk too long");
  if (chunkText("  \n ").length !== 0) failures.push("chunkText: blank text should give no chunks");

  const [equation, similar, unrelated] = await aiService.embed([
    "Solve the equation 3x + 4 = 19 by undoing operations on both sides.",
    "To find x in 2x + 6 = 14, subtract 6 and then divide by 2.",
    "Mitochondria release energy in plant and animal cells.",
  ]);
  const cosine = (a: number[], b: number[]) => {
    const dot = a.reduce((total, value, i) => total + value * b[i], 0);
    const norm = (v: number[]) => Math.sqrt(v.reduce((total, value) => total + value * value, 0));
    return dot / (norm(a) * norm(b));
  };
  if (cosine(equation, similar) <= cosine(equation, unrelated)) {
    failures.push("embed: related text is not closer than unrelated text");
  }
  return failures;
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
  const models: (string | undefined)[] = args.filter((arg) => !arg.startsWith("--"));
  if (!models.length) models.push(undefined);
  const cases = only ? CASES.filter((c) => c.name.includes(only)) : CASES;

  const ragFailures = only ? [] : await checkRagHelpers();
  if (!only) {
    console.log(ragFailures.length ? `RAG helpers FAILED: ${ragFailures.join("; ")}` : "RAG helpers ok");
  }

  const report: Record<string, CaseResult[]> = {};
  const summaries = [];
  for (const model of models) {
    const label = model ?? "defaults";
    console.log(`\n=== ${label} (${cases.length} cases) ===`);
    const results = await runAll(cases, model);
    for (const result of results) {
      console.log(`${result.passed ? "PASS" : result.threw ? "ERR " : "FAIL"}  ${result.name}`);
      for (const failure of result.failures) console.log(`        ${failure}`);
    }
    report[label] = results;
    summaries.push(summarize(label, results));
  }

  console.log();
  console.table(summaries);

  mkdirSync("evals/results", { recursive: true });
  const file = `evals/results/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ ragFailures, summaries, report }, null, 2));
  console.log(`Full results: ${file}`);

  if (ragFailures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
