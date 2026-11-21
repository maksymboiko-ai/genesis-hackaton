// Runs every eval case against each candidate model through the production
// AiService and prints a comparison.
//
//   npm run evals                          default models from lib/ai/models.ts
//   npm run evals -- model/a model/b       compare specific OpenRouter models
//   npm run evals -- --only=replan ...     only cases whose name contains "replan"
//   npm run evals -- --repeat=3 ...        run every case 3 times per model
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

// USD per token, from OpenRouter's public model list.
type Pricing = Map<string, { input: number; output: number }>;

async function fetchPricing(): Promise<Pricing> {
  const pricing: Pricing = new Map();
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body: { data: { id: string; pricing: { prompt: string; completion: string } }[] } =
      await response.json();
    for (const model of body.data) {
      pricing.set(model.id, { input: +model.pricing.prompt, output: +model.pricing.completion });
    }
  } catch (error) {
    console.warn(`Could not load OpenRouter pricing, costs will be blank: ${error}`);
  }
  return pricing;
}

// List-price cost of the calls, or null when a model's price is unknown.
// Reasoning tokens are billed as output tokens and are already counted there.
function costUsd(calls: LlmCallRecord[], pricing: Pricing): number | null {
  let total = 0;
  for (const call of calls) {
    const price = pricing.get(call.model);
    if (!price) return null;
    total += (call.inputTokens ?? 0) * price.input + (call.outputTokens ?? 0) * price.output;
  }
  return total;
}

function summarize(model: string, results: CaseResult[], pricing: Pricing) {
  const calls = results.flatMap((r) => r.calls);
  const sum = (pick: (c: LlmCallRecord) => number | null) =>
    calls.reduce((total, call) => total + (pick(call) ?? 0), 0);
  // Per case, not per call: a retry makes the user wait for both calls.
  const caseSeconds = results
    .map((r) => r.calls.reduce((total, call) => total + call.latencyMs, 0) / 1000)
    .sort((a, b) => a - b);
  const cost = costUsd(calls, pricing);
  return {
    model,
    passed: `${results.filter((r) => r.passed).length}/${results.length}`,
    threw: results.filter((r) => r.threw).length,
    retries: calls.length - results.length,
    avgLatencyS: +(sum((c) => c.latencyMs) / Math.max(calls.length, 1) / 1000).toFixed(1),
    maxCaseLatencyS: +(caseSeconds.at(-1) ?? 0).toFixed(1),
    inputTokens: sum((c) => c.inputTokens),
    outputTokens: sum((c) => c.outputTokens),
    costUsd: cost === null ? null : +cost.toFixed(4),
    usdPerCase: cost === null ? null : +(cost / Math.max(results.length, 1)).toFixed(5),
  };
}

const TASKS: EvalCase["task"][] = ["outline", "lesson", "replan", "learner_notes", "book_map"];

function summarizeByTask(model: string, results: CaseResult[], pricing: Pricing) {
  return TASKS.map((task) => ({ task, results: results.filter((r) => r.task === task) }))
    .filter(({ results }) => results.length)
    .map(({ task, results }) => ({ task, ...summarize(model, results, pricing) }));
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
  const repeat = Number(args.find((arg) => arg.startsWith("--repeat="))?.slice("--repeat=".length) ?? 1);
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error("--repeat must be a positive integer");
  const selected = only ? CASES.filter((c) => c.name.includes(only)) : CASES;
  const cases = Array.from({ length: repeat }, () => selected).flat();
  const pricing = await fetchPricing();

  const ragFailures = only ? [] : await checkRagHelpers();
  if (!only) {
    console.log(ragFailures.length ? `RAG helpers FAILED: ${ragFailures.join("; ")}` : "RAG helpers ok");
  }

  const report: Record<string, CaseResult[]> = {};
  const summaries = [];
  const taskSummaries = [];
  for (const model of models) {
    const label = model ?? "defaults";
    console.log(`\n=== ${label} (${cases.length} cases) ===`);
    const results = await runAll(cases, model);
    for (const result of results) {
      console.log(`${result.passed ? "PASS" : result.threw ? "ERR " : "FAIL"}  ${result.name}`);
      for (const failure of result.failures) console.log(`        ${failure}`);
    }
    report[label] = results;
    summaries.push(summarize(label, results, pricing));
    taskSummaries.push(...summarizeByTask(label, results, pricing));
  }

  console.log();
  console.table(summaries);
  console.table(taskSummaries);

  mkdirSync("evals/results", { recursive: true });
  const file = `evals/results/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ ragFailures, summaries, taskSummaries, report }, null, 2));
  console.log(`Full results: ${file}`);

  if (ragFailures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
