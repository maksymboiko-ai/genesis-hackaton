// Rules for lesson blocks that the schemas in contracts/domain.ts cannot
// express, and the placeholder syntax that puts a block into the lesson
// body. Pure and shared: the AI module and the backend validate with it, the
// browser splits the body with it.
import type { GraphBlock, GraphElement, LessonBlock, NumberLineBlock } from "@/contracts/domain";
import { compile, ExprError, isReservedName, type Scope } from "./expr";

// A line holding only [[block-id]].
const PLACEHOLDER_LINE = /^[ \t]*\[\[([a-z0-9]+(?:-[a-z0-9]+)*)\]\][ \t]*$/;

// The variable of a function element, y = f(x).
export const FUNCTION_VARIABLE = "x";

const MAX_TICKS = 60;
const FUNCTION_SAMPLES = 24;

export type BodyPart = { kind: "markdown"; text: string } | { kind: "block"; id: string };

/** The body as stretches of Markdown and block placeholders, in order. */
export function splitBody(markdown: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let lines: string[] = [];
  let fenced = false;
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text) parts.push({ kind: "markdown", text });
    lines = [];
  };
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const match = fenced ? null : PLACEHOLDER_LINE.exec(line);
    if (!match) {
      lines.push(line);
      continue;
    }
    flush();
    parts.push({ kind: "block", id: match[1] });
  }
  flush();
  return parts;
}

/**
 * Makes the body and the blocks agree: a placeholder with no block (or a
 * second placeholder for the same block) is removed from the body, a block
 * with no placeholder is dropped. The blocks come back in body order;
 * `problems` names each fix.
 */
export function placeBlocks(
  markdown: string,
  blocks: LessonBlock[],
): { bodyMarkdown: string; blocks: LessonBlock[]; problems: string[] } {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const placed = new Set<string>();
  const problems: string[] = [];
  const out: string[] = [];
  // A placeholder written inside a sentence still gets its own line.
  const lined = markdown.replace(/[ \t]*\[\[([a-z0-9]+(?:-[a-z0-9]+)*)\]\][ \t]*/g, "\n\n[[$1]]\n\n");
  for (const part of splitBody(lined)) {
    if (part.kind === "markdown") {
      out.push(part.text);
    } else if (!byId.has(part.id)) {
      problems.push(`the body has [[${part.id}]] but no block has that id`);
    } else if (placed.has(part.id)) {
      problems.push(`[[${part.id}]] appears in the body more than once`);
    } else {
      placed.add(part.id);
      out.push(`[[${part.id}]]`);
    }
  }
  for (const block of blocks) {
    if (!placed.has(block.id)) problems.push(`block "${block.id}" is not placed in the body with [[${block.id}]]`);
  }
  return {
    bodyMarkdown: out.join("\n\n"),
    // In the order they appear in the body.
    blocks: [...placed].map((id) => byId.get(id)!),
    problems,
  };
}

/** The parameters' starting values, by name. */
export function startScope(graph: Pick<GraphBlock, "parameters">): Scope {
  return Object.fromEntries(graph.parameters.map((p) => [p.name, p.value]));
}

/** Every expression of an element with the variables it may use. */
export function elementExprs(element: GraphElement, parameters: string[]): { expr: string; variables: string[] }[] {
  const plain = (exprs: string[]) => exprs.map((expr) => ({ expr, variables: parameters }));
  switch (element.kind) {
    case "point":
      return plain([element.x, element.y]);
    case "segment":
    case "line":
    case "vector":
      return plain([element.x1, element.y1, element.x2, element.y2]);
    case "circle":
      return plain([element.cx, element.cy, element.r]);
    case "function":
      return [{ expr: element.expr, variables: [...parameters, FUNCTION_VARIABLE] }];
    case "polygon":
      return plain(element.points.flatMap((p) => [p.x, p.y]));
  }
}

/**
 * The two parameters a point is bound to when it can be dragged: both of its
 * coordinates are a bare parameter name.
 */
export function dragParameters(
  element: GraphElement,
  graph: Pick<GraphBlock, "parameters">,
): { x: string; y: string } | null {
  if (element.kind !== "point") return null;
  const names = new Set(graph.parameters.map((p) => p.name));
  const x = element.x.trim();
  const y = element.y.trim();
  return names.has(x) && names.has(y) && x !== y ? { x, y } : null;
}

function graphProblem(graph: GraphBlock): string | null {
  if (!(graph.xMin < graph.xMax) || !(graph.yMin < graph.yMax)) return "the axis ranges must have min below max";
  const names = new Set<string>();
  for (const p of graph.parameters) {
    if (p.name === "x" || p.name === "y" || isReservedName(p.name)) return `parameter name "${p.name}" is reserved`;
    if (names.has(p.name)) return `parameter "${p.name}" is defined twice`;
    names.add(p.name);
    if (!(p.min < p.max)) return `parameter "${p.name}" must have min below max`;
    if (p.value < p.min || p.value > p.max) return `parameter "${p.name}" starts outside its range`;
    if ((p.max - p.min) / p.step > 2000) return `parameter "${p.name}" has too small a step`;
  }
  const parameters = [...names];
  const scope = startScope(graph);
  const at = (expr: string, variables: string[]) => compile(expr, variables);
  try {
    for (const element of graph.elements) {
      for (const { expr, variables } of elementExprs(element, parameters)) {
        const fn = at(expr, variables);
        if (element.kind === "function") {
          // Finite somewhere in view: sqrt(x) is fine, sqrt(-1 - x^2) is not.
          const width = graph.xMax - graph.xMin;
          const finite = Array.from({ length: FUNCTION_SAMPLES + 1 }, (_, i) =>
            fn({ ...scope, [FUNCTION_VARIABLE]: graph.xMin + (width * i) / FUNCTION_SAMPLES }),
          ).some(Number.isFinite);
          if (!finite) return `"${expr}" has no value anywhere on the graph`;
        } else if (!Number.isFinite(fn(scope))) {
          return `"${expr}" has no value at the starting parameters`;
        }
      }
      if (element.kind === "circle" && !(at(element.r, parameters)(scope) > 0)) return "a circle needs a positive radius";
    }
    for (const readout of graph.readouts) at(readout.expr, parameters);
  } catch (error) {
    if (error instanceof ExprError) return error.message;
    throw error;
  }
  return null;
}

function numberLineProblem(line: NumberLineBlock): string | null {
  if (!(line.min < line.max)) return "min must be below max";
  if ((line.max - line.min) / line.step > MAX_TICKS) return "the step gives too many ticks";
  if (line.points.some((p) => p.value < line.min || p.value > line.max)) return "a point is off the line";
  for (const range of line.ranges) {
    if (range.from === null && range.to === null) return "a range needs at least one end";
    if (range.from !== null && range.to !== null && !(range.from < range.to)) return "a range must run from low to high";
    if ([range.from, range.to].some((v) => v !== null && (v < line.min || v > line.max))) return "a range end is off the line";
  }
  return null;
}

/** What is wrong with a block that parsed, or null when it can be shown. */
export function blockProblem(block: LessonBlock): string | null {
  switch (block.type) {
    case "graph":
      return graphProblem(block);
    case "number_line":
      return numberLineProblem(block);
    case "check":
      if (block.feedback.length !== block.choices.length) return "needs one feedback entry per choice";
      if (block.answerIndex >= block.choices.length) return "correctIndex points past the choices";
      if (new Set(block.choices.map((c) => c.trim())).size !== block.choices.length) return "has duplicate choices";
      return null;
    case "steps":
      return null;
  }
}
