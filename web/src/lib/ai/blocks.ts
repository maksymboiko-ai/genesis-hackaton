// Turns the blocks a model wrote (the flat Generated* shapes in
// contracts/ai.ts) into stored LessonBlocks, and reports what is wrong with
// the ones that cannot be shown.
import type { GeneratedGraph, LessonOutput } from "@/contracts/ai";
import { LessonBlock, MAX_LESSON_BLOCKS } from "@/contracts/domain";
import { tryCompile } from "@/lib/expr";
import { blockProblem, placeBlocks } from "@/lib/lesson-blocks";

// GraphBlock.readouts holds at most this many.
const MAX_READOUTS = 4;

function toId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

function toElement(element: GeneratedGraph["elements"][number]): unknown {
  const drawn = { label: element.label.trim(), tone: element.tone };
  const line = { x1: element.x1, y1: element.y1, x2: element.x2, y2: element.y2, dashed: element.dashed, ...drawn };
  switch (element.kind) {
    case "point":
      return { kind: "point", x: element.x1, y: element.y1, ...drawn };
    case "segment":
    case "line":
    case "vector":
      return { kind: element.kind, ...line };
    case "circle":
      return { kind: "circle", cx: element.x1, cy: element.y1, r: element.r, dashed: element.dashed, ...drawn };
    case "function":
      // Models often write the whole equation.
      return { kind: "function", expr: element.expr.replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=/i, ""), dashed: element.dashed, ...drawn };
    case "polygon":
      return { kind: "polygon", points: element.points, ...drawn };
  }
}

// A check and a stepped example's title are shown as plain text, where a
// model's backticks around math would show as backticks.
const plain = (text: string) => text.replace(/`/g, "").trim();

// "" means the range runs off that end; anything else must be a number.
function toEnd(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return Number(trimmed.replace(/[−–]/g, "-"));
}

function candidates(output: LessonOutput): { id: string; block: unknown }[] {
  return [
    ...output.graphs.map((g) => ({
      id: g.id,
      block: {
        type: "graph",
        title: g.title.trim(),
        caption: g.caption.trim(),
        xMin: g.xMin,
        xMax: g.xMax,
        yMin: g.yMin,
        yMax: g.yMax,
        parameters: g.parameters.map((p) => ({
          ...p,
          name: p.name.trim(),
          label: p.label.trim(),
          // A start just outside the slider's range is moved onto its end.
          value: p.min < p.max ? Math.min(p.max, Math.max(p.min, p.value)) : p.value,
        })),
        elements: g.elements.map(toElement),
        // A readout is an extra: one that is not a single number (an
        // equation, a coordinate pair) is left out, the graph stays.
        readouts: g.readouts
          .map((r) => ({ label: r.label.trim(), expr: r.expr }))
          .filter((r) => r.label && tryCompile(r.expr, g.parameters.map((p) => p.name.trim())))
          .slice(0, MAX_READOUTS),
      },
    })),
    ...output.numberLines.map((n) => ({
      id: n.id,
      block: {
        type: "number_line",
        title: n.title.trim(),
        caption: n.caption.trim(),
        min: n.min,
        max: n.max,
        step: n.step,
        points: n.points.map((p) => ({ ...p, label: p.label.trim() })),
        ranges: n.ranges.map((r) => ({ from: toEnd(r.from), to: toEnd(r.to) })),
      },
    })),
    ...output.checks.map((c) => ({
      id: c.id,
      block: {
        type: "check",
        prompt: plain(c.prompt),
        choices: c.choices.map(plain),
        answerIndex: c.correctIndex,
        feedback: c.feedback.map(plain),
      },
    })),
    ...output.steppedExamples.map((s) => ({
      id: s.id,
      block: {
        type: "steps",
        // The heading above the block already says "Worked example".
        title: plain(s.title).replace(/^worked example\s*[:.-]?\s*/i, "") || plain(s.title),
        steps: s.steps.map((step) => ({ text: step.text.trim(), math: step.math.trim().replace(/^`+|`+$/g, "") })),
      },
    })),
  ];
}

/**
 * The lesson's blocks in stored form, with the body they sit in. Blocks that
 * cannot be shown and placeholders that lead nowhere are left out; `problems`
 * says what was wrong, in words a model can act on.
 */
export function buildBlocks(output: LessonOutput): { bodyMarkdown: string; blocks: LessonBlock[]; problems: string[] } {
  const problems: string[] = [];
  const blocks: LessonBlock[] = [];
  const seen = new Set<string>();
  for (const { id: rawId, block } of candidates(output)) {
    const id = toId(rawId);
    if (!id || seen.has(id)) {
      problems.push(`block id "${rawId}" is ${id ? "used twice" : "not a valid id"}`);
      continue;
    }
    seen.add(id);
    const parsed = LessonBlock.safeParse({ ...(block as object), id });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      problems.push(`block "${id}": ${issue.path.join(".")} ${issue.message}`);
      continue;
    }
    const problem = blockProblem(parsed.data);
    if (problem) {
      problems.push(`block "${id}": ${problem}`);
      continue;
    }
    blocks.push(parsed.data);
  }
  // Body placeholders are matched against normalized ids.
  const body = output.bodyMarkdown.replace(/\[\[([^\]\n]{1,60})\]\]/g, (_, raw: string) => `[[${toId(raw) || "x"}]]`);
  const placed = placeBlocks(body, blocks.slice(0, MAX_LESSON_BLOCKS));
  return { bodyMarkdown: placed.bodyMarkdown, blocks: placed.blocks, problems: [...problems, ...placed.problems] };
}
