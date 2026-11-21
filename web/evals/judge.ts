// LLM-as-a-judge eval. Runs the eval cases through the production AiService,
// then has a stronger model grade every output against a rubric: the things
// the rule checks in cases.ts cannot see (is the answer key right, does the
// lesson teach, is the diagnosis supported by the answers).
//
//   npm run evals:judge                       default models from lib/ai/models.ts
//   npm run evals:judge -- model/a model/b    judge specific OpenRouter models
//   npm run evals:judge -- --only=lesson      only cases whose name contains "lesson"
//   npm run evals:judge -- --repeat=3         run every case 3 times per model
//   npm run evals:judge -- --judge=model/x    grade with another model
import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import type { AiCallOptions, AiService, AttemptFeedbackInput, LlmCallRecord } from "@/contracts/ai";
import { aiService } from "@/lib/ai";
import { callStructured, InvalidOutputError } from "@/lib/ai/client";
import type { GenerationTask } from "@/lib/ai/models";
import {
  attemptFeedbackPrompt,
  learnerNotesPrompt,
  lessonPrompt,
  outlinePrompt,
  replanPrompt,
} from "@/lib/ai/prompts";
import { CASES, excellingAttempts, strugglingAttempts } from "./cases";

// A different provider from every default generation model, so the judge
// does not grade its own writing.
const DEFAULT_JUDGE = "anthropic/claude-opus-5.5";
const CONCURRENCY = 6;

type Criterion = { id: string; text: string };

// One generated output, with what the judge needs to grade it.
type Sample = {
  task: GenerationTask;
  // The user message the output was written for.
  request: string;
  output: unknown;
  criteria: Criterion[];
};

type Verdict = { criterion: string; reason: string; pass: boolean };

type JudgedCase = {
  name: string;
  task: GenerationTask;
  // Rule checks that failed, or the error when generation threw.
  ruleFailures: string[];
  threw: boolean;
  output: unknown;
  verdicts: Verdict[];
  // Set when the judge call itself failed; the case then has no verdicts.
  judgeError: string | null;
};

// --- Rubrics ----------------------------------------------------------------

const FITS_GRADE: Criterion = {
  id: "fits the grade",
  text: "The vocabulary, the sentence length and the numbers used suit the grade level in the request.",
};

function lessonCriteria(input: Parameters<AiService["generateLesson"]>[0]): Criterion[] {
  return [
    {
      id: "answer key is correct",
      text: "Solve every quiz question yourself before looking at correctIndex (zero-based). Pass only if in every question the choice at correctIndex is correct and no other choice is also correct.",
    },
    {
      id: "body is accurate",
      text: "The lesson body has no mathematical or factual error, including in its worked examples.",
    },
    {
      id: "teaches the objective",
      text: "A child at this grade who reads only the body could learn to do what the objective says: the idea is explained step by step and at least one example is worked in full.",
    },
    {
      id: "quiz matches the lesson",
      text: "Every question tests the lesson's objective and can be answered with only what the body teaches.",
    },
    {
      id: "feedback names the real slip",
      text: "For every wrong choice, the feedback describes a mistake that really produces that choice and then shows the right way. Fail if a described slip does not lead to the choice it is attached to, or if the feedback for the correct choice describes something the child did not do.",
    },
    {
      id: "wrong choices are plausible",
      text: "The wrong choices are what typical mistakes on that question give, not arbitrary or obviously silly values.",
    },
    {
      id: "adapts to the learner",
      text: "The lesson follows the kind guidance in the request (regular, remedial, retry or extension) and the notes on how this child learns. If the notes are \"(none yet)\", judge the kind guidance alone.",
    },
    FITS_GRADE,
    ...(input.sourceChunks.length
      ? [
          {
            id: "follows the textbook",
            text: "The lesson teaches the method the way the excerpts teach it, calls methods, rules, steps and checks by the excerpts' own names, and contradicts nothing in them.",
          },
        ]
      : []),
  ];
}

function outlineCriteria(input: Parameters<AiService["generateOutline"]>[0], askedQuestions: boolean): Criterion[] {
  if (askedQuestions) {
    return [
      {
        id: "questions were needed",
        text: "The goal really does not say which subject or topic to teach, so two reasonable tutors would plan different curricula.",
      },
      {
        id: "questions are answerable",
        text: "A parent can answer each question in one sentence, the answers would settle what to teach, and no question asks for something the request already gives, such as the grade level.",
      },
    ];
  }
  return [
    {
      id: "covers the goal",
      text: "Taken together the lessons reach the goal in the request, and no lesson is off the goal.",
    },
    {
      id: "order builds",
      text: "Every lesson needs only what earlier lessons teach or what a child at this grade already knows.",
    },
    {
      id: "adapts to the learner",
      text: "Where the mastery list shows a related skill is low, the plan starts with that prerequisite; where it is high, the plan does not spend a lesson re-teaching it. If the list is \"(none)\", pass.",
    },
    {
      id: "objectives are checkable",
      text: "Each objective says one thing the child will be able to do that a short multiple-choice quiz could test.",
    },
    {
      id: "skills are narrow",
      text: "Each skill slug names one narrow, testable ability, and the same ability does not appear under two different slugs.",
    },
    FITS_GRADE,
    ...(input.bookSections.length
      ? [
          {
            id: "follows the book",
            text: "Each lesson with a bookSectionIndex teaches what that section of the book map covers, and the sections the goal asks for are all planned.",
          },
        ]
      : []),
  ];
}

function replanCriteria(input: Parameters<AiService["replan"]>[0]): Criterion[] {
  const struggling = input.trigger === "struggling";
  return [
    {
      id: "mistakes match the evidence",
      text: "Every entry in mistakes describes something the child actually did in the wrong answers in the request. None is invented. An empty list passes when the child is excelling.",
    },
    struggling
      ? {
          id: "finds the root cause",
          text: "The diagnosis names the underlying gap that explains most of the wrong answers across the attempts, not only the topics of the lessons that went badly.",
        }
      : {
          id: "summary is supported",
          text: "What the summary says the child has mastered is supported by the scores and answers in the request.",
        },
    struggling
      ? {
          id: "new lessons fit",
          text: "The new lessons teach the missing skills from the ground up and prepare the child for the lessons that went badly, without repeating those lessons.",
        }
      : {
          id: "new lessons fit",
          text: "The new lessons build on what the child learned and go beyond the remaining plan, without duplicating a remaining lesson.",
        },
    {
      id: "parent summary is specific and kind",
      text: "The summary tells a parent in one or two sentences what was found and what changes, in specific terms and without blame.",
    },
    {
      id: "child message is right for a child",
      text: "The childMessage is warm, concrete and at the child's grade level, describes the same change as the summary, and has no scores and no judgement of the child.",
    },
    {
      id: "reasons are specific",
      text: "Each lesson's reason names what in this child's answers led to the lesson; none would fit any child.",
    },
  ];
}

const NOTES_CRITERIA: Criterion[] = [
  {
    id: "supported by the evidence",
    text: "Every claim in the notes follows from the quiz attempts or the previous notes in the request. Nothing is speculation.",
  },
  {
    id: "describes patterns",
    text: "The notes describe patterns across answers, not single questions, and give no scores.",
  },
  {
    id: "keeps what is still true",
    text: "Everything in the previous notes that the attempts do not contradict is still in the notes. If the previous notes are \"(none yet)\", pass.",
  },
  {
    id: "useful to a tutor",
    text: "The notes say at least one concrete thing that would change how the next lesson for this child is written.",
  },
];

const FEEDBACK_CRITERIA: Criterion[] = [
  {
    id: "accurate",
    text: "Everything the headline and summary say about the child's answers is true of the attempt in the request.",
  },
  {
    id: "specific",
    text: "The message names what the right answers have in common or the one pattern worth another look. Fail if it would fit any quiz.",
  },
  {
    id: "honest and warm",
    text: "The tone is warm and at the child's grade level, and the praise matches the result: a low score is not celebrated and a high one is not played down.",
  },
  {
    id: "leaves the review to the review",
    text: "The message does not state the score as a number and does not explain or reveal answers.",
  },
];

// --- Generation -------------------------------------------------------------

// An AiService that keeps every output it returns as a sample to judge.
function recording(samples: Sample[]): AiService {
  return {
    ...aiService,
    async generateOutline(input, options) {
      const output = await aiService.generateOutline(input, options);
      samples.push({
        task: "outline",
        request: outlinePrompt(input).user,
        output,
        criteria: outlineCriteria(input, output.kind === "questions"),
      });
      return output;
    },
    async generateLesson(input, options) {
      const output = await aiService.generateLesson(input, options);
      samples.push({ task: "lesson", request: lessonPrompt(input).user, output, criteria: lessonCriteria(input) });
      return output;
    },
    async replan(input, options) {
      const output = await aiService.replan(input, options);
      samples.push({ task: "replan", request: replanPrompt(input).user, output, criteria: replanCriteria(input) });
      return output;
    },
    async updateLearnerNotes(input, options) {
      const output = await aiService.updateLearnerNotes(input, options);
      samples.push({ task: "learner_notes", request: learnerNotesPrompt(input).user, output, criteria: NOTES_CRITERIA });
      return output;
    },
    async writeAttemptFeedback(input, options) {
      const output = await aiService.writeAttemptFeedback(input, options);
      samples.push({ task: "feedback", request: attemptFeedbackPrompt(input).user, output, criteria: FEEDBACK_CRITERIA });
      return output;
    },
  };
}

type JudgeCase = {
  name: string;
  task: GenerationTask;
  run: (ai: AiService, options: AiCallOptions) => Promise<string[]>;
};

function words(text: string): number {
  return text.trim().split(/\s+/).length;
}

// cases.ts has no feedback cases; these carry the limits the prompt sets.
function feedbackCase(name: string, input: AttemptFeedbackInput): JudgeCase {
  return {
    name,
    task: "feedback",
    run: async (ai, options) => {
      const { headline, summary } = await ai.writeAttemptFeedback(input, options);
      const checks: Record<string, boolean> = {
        "headline is at most 8 words": words(headline) <= 8,
        "summary is at most 35 words": words(summary) <= 35,
        "no banned words": !/\b(wrong|failed|bad|mistakes?)\b/i.test(`${headline} ${summary}`),
        "no score as a number": !/\d+\s?%|\b\d\s?(\/|out of)\s?\d\b/i.test(`${headline} ${summary}`),
      };
      return Object.keys(checks).filter((name) => !checks[name]);
    },
  };
}

const FEEDBACK_CASES: JudgeCase[] = [
  feedbackCase("feedback: low score, sign slips", {
    gradeLevel: 7,
    subject: "algebra",
    attempt: strugglingAttempts[2],
    rightAnswers: [{ prompt: "Solve 2x + 3 = 11", answer: "x = 4", skill: "solving-two-step-equations" }],
  }),
  feedbackCase("feedback: one miss", {
    gradeLevel: 7,
    subject: "algebra",
    attempt: excellingAttempts[2],
    rightAnswers: [
      { prompt: "Expand 3(x + 2)", answer: "3x + 6", skill: "expanding-brackets" },
      { prompt: "Expand 5(x - 1)", answer: "5x - 5", skill: "expanding-brackets" },
      { prompt: "Solve 3(x - 1) = 12", answer: "x = 5", skill: "solving-linear-equations" },
      { prompt: "Solve 4(x + 2) = 20", answer: "x = 3", skill: "solving-linear-equations" },
    ],
  }),
  feedbackCase("feedback: perfect score", {
    gradeLevel: 7,
    subject: "algebra",
    attempt: excellingAttempts[1],
    rightAnswers: [
      { prompt: "Solve 2x + 7 = 15", answer: "x = 4", skill: "solving-two-step-equations" },
      { prompt: "Solve 3x - 5 = 10", answer: "x = 5", skill: "solving-two-step-equations" },
      { prompt: "Solve 4x + 1 = -7", answer: "x = -2", skill: "solving-two-step-equations" },
      { prompt: "Solve -2x + 6 = 12", answer: "x = -3", skill: "solving-two-step-equations" },
      { prompt: "Solve 5x - 9 = -24", answer: "x = -3", skill: "solving-two-step-equations" },
    ],
  }),
];

// Book maps are compared with the headings they were built from in cases.ts;
// a judge adds nothing to that.
const JUDGE_CASES: JudgeCase[] = [...CASES.filter((c) => c.task !== "book_map"), ...FEEDBACK_CASES];

// --- Judging ----------------------------------------------------------------

const Verdicts = z.object({
  verdicts: z.array(z.object({ criterion: z.string(), reason: z.string(), pass: z.boolean() })),
});

const JUDGE_SYSTEM = [
  "You review content written by an AI tutor for US school children. You get the request the content was written for, the content as JSON, and a list of criteria.",
  "Grade each criterion on its own. Work it out first: for anything with numbers, do the arithmetic yourself rather than trusting the content. Then write the reason and only then decide pass.",
  "Fail a criterion only when you can point to a specific defect, and quote it in the reason. Do not fail for something another criterion covers, and do not fail for style you would merely have done differently. When it passes, the reason is one short sentence.",
  "Return one verdict per criterion, with criterion copied exactly from the name in the list.",
].join("\n\n");

function judgeUser(sample: Sample): string {
  // Question ids are random and `explanation` repeats the feedback for the
  // correct choice.
  const content = JSON.stringify(sample.output, (key, value) => (key === "id" || key === "explanation" ? undefined : value), 2);
  return [
    `## Request\n${sample.request}`,
    `## Content\n${content}`,
    `## Criteria\n${sample.criteria.map((c) => `- ${c.id}: ${c.text}`).join("\n")}`,
  ].join("\n\n");
}

function judge(sample: Sample, model: string, onCall: (record: LlmCallRecord) => void): Promise<Verdict[]> {
  return callStructured({
    // The client reports every call under a task; a judge call is reported
    // under the task it grades.
    task: sample.task,
    model,
    system: JUDGE_SYSTEM,
    user: judgeUser(sample),
    schemaName: "verdicts",
    schema: Verdicts,
    onCall,
    check: ({ verdicts }) =>
      sample.criteria.map(({ id }) => {
        const verdict = verdicts.find((v) => v.criterion.trim().toLowerCase() === id);
        if (!verdict) throw new InvalidOutputError(`no verdict for the criterion "${id}"`);
        return { ...verdict, criterion: id };
      }),
  });
}

// --- Runner -----------------------------------------------------------------

type Calls = { generation: LlmCallRecord[]; judge: LlmCallRecord[] };

async function runCase(
  judgeCase: JudgeCase,
  model: string | undefined,
  judgeModel: string,
  calls: Calls,
): Promise<JudgedCase> {
  const samples: Sample[] = [];
  const base = { name: judgeCase.name, task: judgeCase.task };
  let ruleFailures: string[];
  try {
    ruleFailures = await judgeCase.run(recording(samples), {
      model,
      onCall: (record) => calls.generation.push(record),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...base, ruleFailures: [message], threw: true, output: null, verdicts: [], judgeError: null };
  }
  // Every case makes one generation call.
  const sample = samples[0];
  try {
    const verdicts = await judge(sample, judgeModel, (record) => calls.judge.push(record));
    return { ...base, ruleFailures, threw: false, output: sample.output, verdicts, judgeError: null };
  } catch (error) {
    const judgeError = error instanceof Error ? error.message : String(error);
    return { ...base, ruleFailures, threw: false, output: sample.output, verdicts: [], judgeError };
  }
}

async function runAll(
  cases: JudgeCase[],
  model: string | undefined,
  judgeModel: string,
  calls: Calls,
): Promise<JudgedCase[]> {
  const results: JudgedCase[] = new Array(cases.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < cases.length) {
        const index = next++;
        results[index] = await runCase(cases[index], model, judgeModel, calls);
      }
    }),
  );
  return results;
}

// A judge that passes everything proves nothing. Take a lesson whose answer
// key it accepted, move one correct answer to the next choice, and check
// that it now fails the key.
async function canary(results: JudgedCase[], judgeModel: string, calls: Calls): Promise<string> {
  const accepted = results.find(
    (r) => r.task === "lesson" && r.verdicts.some((v) => v.criterion === "answer key is correct" && v.pass),
  );
  if (!accepted) return "skipped: no lesson with an accepted answer key";
  const broken: { questions: { correctIndex: number; choices: string[] }[] } = structuredClone(
    accepted.output as { questions: { correctIndex: number; choices: string[] }[] },
  );
  const question = broken.questions[0];
  question.correctIndex = (question.correctIndex + 1) % question.choices.length;
  try {
    const [verdict] = await judge(
      {
        task: "lesson",
        request: `(the lesson "${accepted.name}")`,
        output: broken,
        criteria: [lessonCriteria({ sourceChunks: [] } as never)[0]],
      },
      judgeModel,
      (record) => calls.judge.push(record),
    );
    return verdict.pass ? "MISSED: the judge accepted a wrong answer key" : "caught a planted wrong answer key";
  } catch (error) {
    return `error: ${error instanceof Error ? error.message : error}`;
  }
}

function tokens(records: LlmCallRecord[]) {
  return {
    calls: records.length,
    inputTokens: records.reduce((total, r) => total + (r.inputTokens ?? 0), 0),
    outputTokens: records.reduce((total, r) => total + (r.outputTokens ?? 0), 0),
  };
}

// Pass counts per criterion, grouped by task.
function byCriterion(results: JudgedCase[]) {
  const rows: Record<string, { passed: number; judged: number }> = {};
  for (const result of results) {
    for (const verdict of result.verdicts) {
      const row = (rows[`${result.task} / ${verdict.criterion}`] ??= { passed: 0, judged: 0 });
      row.judged++;
      if (verdict.pass) row.passed++;
    }
  }
  return Object.fromEntries(
    Object.entries(rows).map(([name, row]) => [name, { passed: `${row.passed}/${row.judged}` }]),
  );
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const only = flag("only");
  const judgeModel = flag("judge") ?? DEFAULT_JUDGE;
  const repeat = Number(flag("repeat") ?? 1);
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error("--repeat must be a positive integer");
  const models: (string | undefined)[] = args.filter((arg) => !arg.startsWith("--"));
  if (!models.length) models.push(undefined);
  const selected = only ? JUDGE_CASES.filter((c) => c.name.includes(only)) : JUDGE_CASES;
  const cases = Array.from({ length: repeat }, () => selected).flat();

  const report: Record<string, unknown> = {};
  for (const model of models) {
    const label = model ?? "defaults";
    console.log(`\n=== ${label}, judged by ${judgeModel} (${cases.length} cases) ===`);
    const calls: Calls = { generation: [], judge: [] };
    const results = await runAll(cases, model, judgeModel, calls);
    for (const result of results) {
      const failed = result.verdicts.filter((v) => !v.pass);
      const status = result.threw ? "ERR " : result.judgeError ? "J-ERR" : failed.length ? "FAIL" : "PASS";
      console.log(`${status}  ${result.name}  (${result.verdicts.length - failed.length}/${result.verdicts.length})`);
      for (const failure of result.ruleFailures) console.log(`        rule: ${failure}`);
      if (result.judgeError) console.log(`        judge error: ${result.judgeError}`);
      for (const verdict of failed) console.log(`        judge: ${verdict.criterion}: ${verdict.reason}`);
    }
    const canaryResult = await canary(results, judgeModel, calls);
    console.log(`\nJudge check: ${canaryResult}`);
    console.table(byCriterion(results));
    console.table({ generation: tokens(calls.generation), judge: tokens(calls.judge) });
    report[label] = { judge: judgeModel, canary: canaryResult, criteria: byCriterion(results), results };
  }

  mkdirSync("evals/results", { recursive: true });
  const file = `evals/results/judge-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`Full results: ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
