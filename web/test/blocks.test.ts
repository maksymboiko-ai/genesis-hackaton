import { describe, expect, it } from "vitest";
import { GET as getLesson } from "@/app/api/lessons/[lessonId]/route";
import type { LessonOutput } from "@/contracts/ai";
import { GetLessonResponse } from "@/contracts/api";
import { LessonContent, type GraphBlock, type LessonBlock } from "@/contracts/domain";
import { buildBlocks } from "@/lib/ai/blocks";
import { compile, ExprError } from "@/lib/expr";
import { blockProblem, dragParameters, placeBlocks, splitBody } from "@/lib/lesson-blocks";
import { checkLessonContent } from "@/lib/server/lessons";
import { call, jsonRequest, readyCurriculum } from "./helpers";

const value = (expr: string, scope: Record<string, number> = {}) => compile(expr, Object.keys(scope))(scope);

describe("expressions", () => {
  it("evaluates arithmetic with the usual precedence", () => {
    expect(value("1 + 2 * 3")).toBe(7);
    expect(value("(1 + 2) * 3")).toBe(9);
    expect(value("-2^2")).toBe(-4);
    expect(value("2^-1")).toBe(0.5);
    expect(value("2^3^2")).toBe(512);
    expect(value("10 / 4 - 1")).toBe(1.5);
    expect(value("sqrt(3^2 + 4^2)")).toBe(5);
    expect(value("max(2, abs(-7))")).toBe(7);
    expect(value("2pi")).toBeCloseTo(2 * Math.PI);
  });

  it("reads implicit multiplication the way a textbook writes it", () => {
    expect(value("2x + 1", { x: 3 })).toBe(7);
    expect(value("mx + b", { m: 2, x: 3, b: 1 })).toBe(7);
    expect(value("3(x + 1)", { x: 1 })).toBe(6);
    expect(value("2x^2", { x: 3 })).toBe(18);
    expect(value("(x - 1)(x + 1)", { x: 4 })).toBe(15);
    expect(value("x² − 4", { x: 3 })).toBe(5);
    expect(value("√(x)", { x: 9 })).toBe(3);
  });

  it("rejects what it cannot evaluate, and never runs code", () => {
    for (const bad of ["", "2 +", "(1", "unknown + 1", "sqrt(1, 2)", "1 ; 2", "alert(1)", "constructor", "x.y", "a = 1", "[1]", "__proto__"]) {
      expect(() => compile(bad, ["x"]), bad).toThrow(ExprError);
    }
    expect(() => compile("(".repeat(60) + "1" + ")".repeat(60), [])).toThrow(ExprError);
    expect(() => compile("1+".repeat(150) + "1", [])).toThrow(ExprError);
  });
});

const graph = (over: Partial<GraphBlock> = {}): GraphBlock => ({
  type: "graph",
  id: "graph-1",
  title: "A line",
  caption: "",
  xMin: -5,
  xMax: 5,
  yMin: -5,
  yMax: 5,
  parameters: [
    { name: "a", label: "A x", min: -4, max: 4, step: 1, value: 1 },
    { name: "b", label: "A y", min: -4, max: 4, step: 1, value: 2 },
  ],
  elements: [
    { kind: "point", x: "a", y: "b", label: "A", tone: "primary" },
    { kind: "function", expr: "2x + a", dashed: false, label: "", tone: "secondary" },
  ],
  readouts: [{ label: "Distance from origin", expr: "sqrt(a^2 + b^2)" }],
  ...over,
});

describe("block rules", () => {
  it("accepts a sound graph and finds the point that can be dragged", () => {
    const g = graph();
    expect(blockProblem(g)).toBeNull();
    expect(dragParameters(g.elements[0], g)).toEqual({ x: "a", y: "b" });
    expect(dragParameters(g.elements[1], g)).toBeNull();
    expect(dragParameters({ kind: "point", x: "a", y: "a + 1", label: "", tone: "primary" }, g)).toBeNull();
  });

  it("names what is wrong with a graph", () => {
    const point = (x: string, y: string) => [{ kind: "point" as const, x, y, label: "", tone: "primary" as const }];
    expect(blockProblem(graph({ xMin: 5, xMax: 5 }))).toMatch(/axis/);
    expect(blockProblem(graph({ elements: point("c", "1") }))).toMatch(/unknown name "c"/);
    expect(blockProblem(graph({ elements: point("1/0", "1") }))).toMatch(/no value/);
    expect(blockProblem(graph({ elements: point("x", "1") }))).toMatch(/unknown name "x"/);
    expect(blockProblem(graph({ parameters: [{ name: "e", label: "", min: 0, max: 1, step: 1, value: 0 }], elements: point("1", "1"), readouts: [] }))).toMatch(/reserved/);
    expect(blockProblem(graph({ parameters: [{ name: "k", label: "", min: 0, max: 1, step: 1, value: 5 }], elements: point("1", "1"), readouts: [] }))).toMatch(/outside its range/);
    expect(blockProblem(graph({ elements: [{ kind: "function", expr: "sqrt(-1 - x^2)", dashed: false, label: "", tone: "primary" }] }))).toMatch(/no value anywhere/);
    expect(blockProblem(graph({ elements: [{ kind: "circle", cx: "0", cy: "0", r: "0", dashed: false, label: "", tone: "primary" }] }))).toMatch(/radius/);
    expect(blockProblem(graph({ readouts: [{ label: "x", expr: "a +" }] }))).not.toBeNull();
    // sqrt(x) has no value left of zero, and that is fine.
    expect(blockProblem(graph({ elements: [{ kind: "function", expr: "sqrt(x)", dashed: false, label: "", tone: "primary" }] }))).toBeNull();
  });

  it("checks number lines and quick checks", () => {
    const line: LessonBlock = { type: "number_line", id: "l", title: "", caption: "", min: 0, max: 10, step: 1, points: [], ranges: [] };
    expect(blockProblem(line)).toBeNull();
    expect(blockProblem({ ...line, step: 0.01 })).toMatch(/ticks/);
    expect(blockProblem({ ...line, points: [{ value: 11, label: "", open: false }] })).toMatch(/off the line/);
    expect(blockProblem({ ...line, ranges: [{ from: null, to: null }] })).toMatch(/one end/);
    expect(blockProblem({ ...line, ranges: [{ from: 3, to: null }] })).toBeNull();
    const check: LessonBlock = { type: "check", id: "c", prompt: "?", choices: ["a", "b"], answerIndex: 1, feedback: ["no", "yes"] };
    expect(blockProblem(check)).toBeNull();
    expect(blockProblem({ ...check, answerIndex: 2 })).not.toBeNull();
    expect(blockProblem({ ...check, feedback: ["no", "yes", "extra"] })).not.toBeNull();
    expect(blockProblem({ ...check, choices: ["a", "a"] })).not.toBeNull();
  });

  it("splits a body at placeholder lines, but not inside code fences", () => {
    expect(splitBody("Intro\n\n[[graph-1]]\n\nAfter\n\n```\n[[not-one]]\n```")).toEqual([
      { kind: "markdown", text: "Intro" },
      { kind: "block", id: "graph-1" },
      { kind: "markdown", text: "After\n\n```\n[[not-one]]\n```" },
    ]);
  });

  it("makes the body and the blocks agree", () => {
    const g = graph();
    const out = placeBlocks("See [[graph-1]] here.\n\n[[ghost]]\n\n[[graph-1]]", [g, graph({ id: "unplaced" })]);
    expect(out.blocks.map((b) => b.id)).toEqual(["graph-1"]);
    expect(out.bodyMarkdown).toBe("See\n\n[[graph-1]]\n\nhere.");
    expect(out.problems).toHaveLength(3);
    expect(placeBlocks("Text\n\n[[graph-1]]", [g]).problems).toEqual([]);
  });
});

const lessonOutput = (over: Partial<LessonOutput> = {}): LessonOutput => ({
  bodyMarkdown: "Intro\n\n[[Graph 1]]\n\n[[check-1]]\n\n[[steps-1]]\n\n[[line-1]]",
  graphs: [
    {
      id: "Graph 1",
      title: "Line",
      caption: "",
      xMin: -5,
      xMax: 5,
      yMin: -5,
      yMax: 5,
      parameters: [{ name: "m", label: "Slope", min: -3, max: 3, step: 0.5, value: 1 }],
      elements: [
        { kind: "function", label: "", tone: "primary", dashed: false, x1: "", y1: "", x2: "", y2: "", r: "", expr: "y = mx + 1", points: [] },
        { kind: "circle", label: "", tone: "muted", dashed: true, x1: "0", y1: "0", x2: "", y2: "", r: "2", expr: "", points: [] },
        { kind: "polygon", label: "", tone: "secondary", dashed: false, x1: "", y1: "", x2: "", y2: "", r: "", expr: "", points: [{ x: "0", y: "0" }, { x: "1", y: "0" }, { x: "0", y: "m" }] },
      ],
      readouts: [],
    },
  ],
  numberLines: [{ id: "line-1", title: "", caption: "", min: -5, max: 5, step: 1, points: [], ranges: [{ from: "2", to: "" }] }],
  checks: [{ id: "check-1", prompt: "Which?", choices: ["a", "b"], correctIndex: 1, feedback: ["no", "yes"] }],
  steppedExamples: [{ id: "steps-1", title: "Solve", steps: [{ text: "One", math: "`x = 1`" }, { text: "Two", math: "" }] }],
  questions: [],
  ...over,
});

describe("blocks from model output", () => {
  it("turns the flat shapes into stored blocks, placed in the body", () => {
    const out = buildBlocks(lessonOutput());
    expect(out.problems).toEqual([]);
    expect(out.blocks.map((b) => `${b.type}:${b.id}`)).toEqual(["graph:graph-1", "check:check-1", "steps:steps-1", "number_line:line-1"]);
    expect(out.bodyMarkdown).toContain("[[graph-1]]");
    const g = out.blocks[0] as GraphBlock;
    expect(g.elements[0]).toMatchObject({ kind: "function", expr: " mx + 1" });
    expect(g.elements[1]).toMatchObject({ kind: "circle", cx: "0", cy: "0", r: "2" });
    const line = out.blocks.find((b) => b.type === "number_line");
    expect(line).toMatchObject({ ranges: [{ from: 2, to: null }] });
    const steps = out.blocks.find((b) => b.type === "steps");
    expect(steps).toMatchObject({ steps: [{ text: "One", math: "x = 1" }, { text: "Two", math: "" }] });
    expect(out.blocks.find((b) => b.type === "check")).toMatchObject({ answerIndex: 1 });
  });

  it("reports a broken block and leaves it and its placeholder out", () => {
    const base = lessonOutput();
    const out = buildBlocks(
      lessonOutput({
        graphs: [{ ...base.graphs[0], elements: [{ ...base.graphs[0].elements[0], expr: "q * x" }] }],
        checks: [{ ...base.checks[0], correctIndex: 5 }],
      }),
    );
    expect(out.problems.join(" ")).toMatch(/graph-1.*unknown name "q"/);
    expect(out.problems.join(" ")).toMatch(/check-1/);
    expect(out.blocks.map((b) => b.id)).toEqual(["steps-1", "line-1"]);
    expect(out.bodyMarkdown).not.toMatch(/graph-1|check-1/);
  });

  it("keeps a graph whose readout is not a number, without that readout", () => {
    const base = lessonOutput();
    const out = buildBlocks(
      lessonOutput({
        graphs: [
          {
            ...base.graphs[0],
            parameters: [{ ...base.graphs[0].parameters[0], value: 9 }],
            readouts: [
              { label: "Equation", expr: "(x - h)^2 + (y - k)^2 = r^2" },
              { label: "Midpoint", expr: "((m + 1)/2, (m + 3)/2)" },
              { label: "", expr: "m" },
              { label: "Twice the slope", expr: "2m" },
            ],
          },
        ],
      }),
    );
    expect(out.problems).toEqual([]);
    const g = out.blocks.find((b) => b.type === "graph") as GraphBlock;
    expect(g.readouts).toEqual([{ label: "Twice the slope", expr: "2m" }]);
    // The slider started past its end and was moved onto it.
    expect(g.parameters[0].value).toBe(3);
  });
});

describe("blocks through the backend", () => {
  it("a generated lesson is served with its blocks, quiz answers still hidden", async () => {
    const { curriculum } = await readyCurriculum();
    const res = await call(getLesson, jsonRequest("GET", "/x"), { lessonId: curriculum.lessons[0].id });
    const lesson = GetLessonResponse.parse(res.body);
    const blocks = lesson.content!.blocks;
    expect(blocks.map((b) => b.type).sort()).toEqual(["check", "graph", "number_line", "steps"]);
    for (const block of blocks) expect(lesson.content!.bodyMarkdown).toContain(`[[${block.id}]]`);
    expect(JSON.stringify(res.body)).not.toMatch(/correctIndex|choiceFeedback|explanation/);
  });

  it("checkLessonContent drops blocks that cannot be shown, and reads lessons stored without blocks", () => {
    const question = { id: "q1", prompt: "2+2?", choices: ["1", "2", "3", "4"], correctIndex: 3, explanation: "e", choiceFeedback: ["n", "n", "n", "y"], skill: "adding" };
    const out = checkLessonContent({
      bodyMarkdown: "Intro\n\n[[graph-1]]\n\n[[bad]]\n\n[[nowhere]]",
      blocks: [
        graph({ title: "<script>x</script>".repeat(40) }),
        graph({ id: "bad", elements: [{ kind: "point", x: "nope", y: "1", label: "", tone: "primary" }] }),
        graph({ id: "graph-1", title: "duplicate id" }),
      ],
      questions: [question],
    });
    expect(out.blocks.map((b) => b.id)).toEqual(["graph-1"]);
    expect((out.blocks[0] as GraphBlock).title.length).toBeLessThanOrEqual(150);
    expect(out.bodyMarkdown).toBe("Intro\n\n[[graph-1]]");

    expect(checkLessonContent({ bodyMarkdown: "Old lesson", questions: [question] }).blocks).toEqual([]);
    expect(LessonContent.parse({ bodyMarkdown: "Old lesson", questions: [question] }).blocks).toEqual([]);
  });
});
