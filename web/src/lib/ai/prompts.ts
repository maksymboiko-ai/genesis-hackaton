// Every prompt in the app. Each builder returns the system and user message
// for one task; the output shape is enforced separately by the JSON schema.
import type {
  AttemptFeedbackInput,
  ExtendOutlineInput,
  GenerateLessonInput,
  GenerateOutlineInput,
  LessonAttemptSummary,
  ReplanInput,
  UpdateLearnerNotesInput,
} from "@/contracts/ai";
import {
  CHOICES_PER_QUESTION,
  MAX_CLARIFYING_QUESTIONS,
  MAX_OUTLINE_LESSONS,
  type BookSection,
  type LearnerProfile,
} from "@/contracts/domain";

export type Prompt = { system: string; user: string };

// The product is for the US market.
const STYLE_RULE =
  "Write in American English and follow US school conventions: grade levels, spelling, units and math notation.";

const ESTIMATE_RULE =
  "Give every lesson estimatedMinutes: the whole minutes this child needs to work through it and answer its quiz, from 5 to 45. A lesson is a full explanation with worked examples, things to try and 5 to 7 quiz questions, so typically 10 to 15 minutes for grades 1 to 4 and 15 to 25 above; more for dense topics, less for short reviews.";

// How long a lesson is at each grade: words in the body, questions in the quiz.
export function lessonSize(gradeLevel: number): { minWords: number; maxWords: number; questions: number } {
  if (gradeLevel <= 2) return { minWords: 350, maxWords: 550, questions: 5 };
  if (gradeLevel <= 4) return { minWords: 500, maxWords: 750, questions: 5 };
  if (gradeLevel <= 8) return { minWords: 700, maxWords: 1000, questions: 7 };
  return { minWords: 800, maxWords: 1200, questions: 7 };
}

const SKILL_RULE =
  'A skill is a lowercase kebab-case slug naming one narrow, testable ability, e.g. "solving-linear-equations". If a known skill fits, reuse its slug exactly instead of inventing a near-duplicate.';

function section(title: string, body: string): string {
  return `## ${title}\n${body}`;
}

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "(none)";
}

function learnerSection(learner: LearnerProfile): string {
  const mastery = learner.mastery.map(
    (m) => `${m.subject} / ${m.skill}: ${m.mastery.toFixed(2)}`,
  );
  return section(
    "Learner",
    [
      `Grade level: ${learner.gradeLevel}`,
      `Notes on how this child learns: ${learner.notes || "(none yet)"}`,
      "Skill mastery, 0 (not learned) to 1 (mastered), 0.5 means untested:",
      list(mastery),
    ].join("\n"),
  );
}

function sourceSection(sourceChunks: string[]): string {
  if (!sourceChunks.length) return "";
  return section(
    "Textbook excerpts",
    "Base the content on these excerpts: follow their order of topics and their notation, and do not contradict them. Teach the method the way the excerpts teach it, and call every method, rule, step and check by the name the excerpts give it, so the lesson matches what the child sees in the book. Keep the excerpts' own picture of the idea and its everyday words too: where the book has its own word for something, use that word every time instead of the usual school term. Where they do not cover something, teach it in the same style.\n\n" +
      sourceChunks
        .map((chunk, index) => `[Excerpt ${index + 1}]\n${chunk}`)
        .join("\n\n"),
  );
}

export function sectionLabel(section: BookSection): string {
  return section.chapter
    ? `${section.chapter} > ${section.title}`
    : section.title;
}

function bookMapSection(sections: BookSection[]): string {
  if (!sections.length) return "";
  return section(
    "Book map",
    sections
      .map((s) => `[${s.index}] ${sectionLabel(s)}: ${s.summary}`)
      .join("\n"),
  );
}

function attemptsSection(
  attempts: (LessonAttemptSummary & { subject?: string })[],
): string {
  return section(
    "Recent quiz attempts",
    attempts
      .map((attempt) => {
        const wrong = attempt.wrongAnswers.map(
          (w) =>
            `[${w.skill}] "${w.prompt}" answered "${w.chosen}", correct was "${w.correct}"`,
        );
        return [
          `Lesson: ${attempt.lesson.title}${attempt.subject ? ` (${attempt.subject})` : ""}`,
          `Objective: ${attempt.lesson.objective}`,
          `Skills: ${attempt.lesson.skills.join(", ")}`,
          `Score: ${Math.round(attempt.score * 100)}%`,
          `Wrong answers:\n${list(wrong)}`,
        ].join("\n");
      })
      .join("\n\n"),
  );
}

function join(parts: string[]): string {
  return parts.filter(Boolean).join("\n\n");
}

export function outlinePrompt(input: GenerateOutlineInput): Prompt {
  const answered = input.clarifications.length > 0;
  const clarifyRule = answered
    ? "The clarifying questions have been answered. Do not ask more: return questions as [] and a complete outline, making sensible assumptions for anything still unknown."
    : `Ask only when you cannot tell which subject or topic the goal is about, so that two reasonable tutors would plan different curricula. Then return 1 to ${MAX_CLARIFYING_QUESTIONS} short questions a parent can answer in a sentence, with subject and title as "" and lessons as []. A goal that names a subject and a topic or a problem ("got a B in algebra", "fractions for 5th grade") is clear enough: return questions as [] and the outline. Never ask about the grade level or anything else already given below.`;

  const hasBook = input.bookSections.length > 0;
  const lengthRule = `The plan must cover the goal from its first prerequisite to confident independent use, not sample it, so its length follows the scope of the goal. One narrow skill, or the repair of one weak spot: 4 to 6 lessons. A typical school unit (fractions, linear equations, photosynthesis): 8 to 14. A broad subject or a whole course (analytic geometry, grade 7 math, US history to 1877): 18 to ${MAX_OUTLINE_LESSONS}. Before you write the lessons, list for yourself every subtopic the goal contains; give each its own lesson, two where one would be crowded, and leave none out. After every 4 to 6 lessons add one of mixed practice on what came before, and end with a lesson that applies everything together. Never more than ${MAX_OUTLINE_LESSONS} lessons.`;
  const bookRule = hasBook
    ? `The curriculum teaches from the family's textbook, whose sections are listed in the book map. Plan one lesson per section that the goal covers, in the book's order, using the book's own terms in titles and objectives; that is the plan's length, up to ${MAX_OUTLINE_LESSONS} lessons. If the goal covers more sections than that, teach the ones that matter most at this grade. Set each lesson's bookSectionIndex to the number in brackets of the section it is taught from, or -1 for a lesson (such as a prerequisite the learner is missing) that no section covers.`
    : `${lengthRule} There is no textbook, so set every lesson's bookSectionIndex to -1.`;

  return {
    system: join([
      "You design personal curricula for school children. From a goal stated by a parent or child you plan an ordered list of lessons.",
      "Each lesson has a title, a one-sentence objective saying what the child will be able to do, and the 1 to 3 skills it teaches. Order the lessons so each builds on the ones before it.",
      ESTIMATE_RULE,
      bookRule,
      "Adapt to the learner. Where mastery of a related skill is low, start with prerequisites, take smaller steps and plan more practice. Where it is high, skip the basics and go deeper. Fit the grade level.",
      SKILL_RULE,
      clarifyRule,
      "The subject is one or two lowercase words, e.g. \"algebra\" or \"biology\". Reuse a subject from the learner's mastery list when it is the same one.",
      STYLE_RULE,
    ]),
    user: join([
      section("Goal", input.prompt),
      answered
        ? section(
            "Clarifications",
            input.clarifications
              .map((c) => `Q: ${c.question}\nA: ${c.answer}`)
              .join("\n\n"),
          )
        : "",
      learnerSection(input.learner),
      section("Known skills", list(input.knownSkills)),
      bookMapSection(input.bookSections),
    ]),
  };
}

export function extendPrompt(input: ExtendOutlineInput): Prompt {
  const hasBook = input.bookSections.length > 0;
  const taught = new Set(input.lessons.map((lesson) => lesson.bookSectionIndex));
  const bookRule = hasBook
    ? "The plan teaches from the family's textbook, whose sections are listed in the book map; the ones already taught are marked. The book decides what comes next, and this rule comes before the ones above: the next lessons are the untaught sections that follow the last taught one, in the book's order, one lesson per section, using the book's own terms, even where they start a new chapter or topic. Set each lesson's bookSectionIndex to the number in brackets of its section. Only when no untaught section is left, or for a lesson no section covers (such as the return to a shaky skill), go beyond the book and use -1."
    : "There is no textbook, so set every lesson's bookSectionIndex to -1.";
  const plan = input.lessons.map((lesson, index) => {
    const score = lesson.score === null ? "not attempted" : `quiz score ${Math.round(lesson.score * 100)}%`;
    const kind = lesson.kind === "core" ? "" : ` [${lesson.kind}]`;
    return `${index + 1}.${kind} ${lesson.title}: ${lesson.objective} (skills: ${lesson.skills.join(", ")}; ${score})`;
  });

  return {
    system: join([
      "You continue a personal curriculum for a school child. The child has finished every lesson of the plan and asked for more, so plan the lessons that come next.",
      `Plan 4 to ${input.maxLessons} lessons that take the child further, the way a good tutor would go on. Read the plan so far as your starting point: never repeat a lesson it already has, and build on what it taught. If the results show a skill that is still shaky (a quiz score under 60% or mastery under 0.5), open with one lesson that returns to it from a new angle. Then move forward: the topics that naturally follow in this subject, harder kinds of problems, applications to real situations, and links to neighboring topics. Stay inside the subject of the original goal. End with a lesson that combines the new material with the old.`,
      "Each lesson has a title, a one-sentence objective saying what the child will be able to do, and the 1 to 3 skills it teaches. Order the lessons so each builds on the ones before it.",
      ESTIMATE_RULE,
      bookRule,
      "Adapt to the learner: where mastery is high, go deeper and faster; where it is low, take smaller steps. Fit the grade level.",
      SKILL_RULE,
      STYLE_RULE,
    ]),
    user: join([
      section("Goal the plan was built for", input.prompt),
      section("Plan", `Subject: ${input.subject}\nTitle: ${input.title}`),
      section("The plan so far, all of it done", plan.join("\n")),
      learnerSection(input.learner),
      section("Known skills", list(input.knownSkills)),
      hasBook
        ? section(
            "Book map",
            input.bookSections
              .map((s) => `[${s.index}]${taught.has(s.index) ? " (taught)" : ""} ${sectionLabel(s)}: ${s.summary}`)
              .join("\n"),
          )
        : "",
    ]),
  };
}

const KIND_GUIDANCE: Record<GenerateLessonInput["lesson"]["kind"], string> = {
  core: "This is a regular lesson in the curriculum.",
  remedial:
    "This is a remedial lesson: the child recently got questions on these skills wrong. Assume the earlier explanation did not work. Start from the prerequisite idea, use a different explanation and simpler numbers or examples, and go one small step at a time.",
  retry:
    "This is a second try at a lesson the child failed, after remedial lessons. Teach the same objective with a fresh explanation and new examples and questions; do not assume the child remembers the first version.",
  extension:
    "This is an extension lesson for a child who is excelling. Skip the basics, go deeper than the curriculum requires, and make the questions genuinely challenging.",
};

const BLOCKS_RULE = [
  "Interactive blocks make the child do something instead of only reading. Write each block's data in its array (graphs, numberLines, checks, steppedExamples) and put it into the body with a line that holds only its id in double square brackets, such as [[check-1]], at the place where it belongs. Give every block its own lowercase id (graph-1, check-2). Place every block exactly once, and lead into it in the sentence before (\"Move the slider and watch what the line does.\").",
  "checks: 2 or 3 per lesson. A check is one quick question placed right after the idea it tests and before the next idea starts, so the child finds out at once whether it landed. 2 to 4 choices, exactly one correct, a zero-based correctIndex, and feedback with one entry per choice, following the same rules as the quiz feedback below (name the slip and show the right way; never say wrong or incorrect). A check never repeats a quiz question.",
  "steppedExamples: at least 1 per lesson. This is a worked example the child opens one step at a time, so put one of the lesson's worked examples here instead of writing it out in the body, and place it under its own heading. title is the problem being solved. Each of its 3 to 7 steps has text (what is done and why, one or two sentences) and math (the line of working the step ends with, or \"\" when there is none; plain text, no backticks).",
  "graphs: a coordinate plane. Use one whenever the idea can be seen: coordinates, distance, slope, lines and curves, functions, shapes on a grid, vectors, how one quantity changes with another. A lesson in geometry, analytic geometry, functions or graphing needs at least one, and usually two. A lesson with nothing to draw (grammar, reading, history) has none: return [].",
  "A graph has a title, a caption (one sentence on what to notice or try, or \"\"), the visible ranges xMin, xMax, yMin, yMax, and elements. Choose the ranges so everything fits with room around it; when shapes, circles or angles matter, give both axes the same length so one unit looks the same on each. Every position is an expression: text holding a number or a formula, such as \"3\", \"-1.5\", \"2*m + 1\" or \"sqrt(a^2 + b^2)\". Expressions may use + - * / ^, parentheses, sqrt, abs, sin, cos, tan, ln, log, exp, min, max, pi and e. Each element has a kind, a short label (\"A\", \"y = 2x + 1\", or \"\"), a tone (primary for what the lesson is about, secondary for what it is compared with, muted for helper lines), dashed, and the fields its kind uses; set the fields it does not use to \"\" and points to []. point: x1, y1. segment, line (runs on forever) and vector (an arrow): from x1, y1 to x2, y2. circle: center x1, y1 and radius r. function: expr, the right-hand side of y = ..., written with x, such as \"m*x + b\". polygon: points, its corners in order.",
  "parameters make a graph interactive. Each is a slider with a name (a lowercase letter or short word, never x, y, e or pi), a label, min, max, step and a starting value. Any expression may use the parameter names, and the graph redraws as the child moves the slider. A point whose x1 and y1 are each exactly one parameter name (x1 \"a\", y1 \"b\") can be dragged by the child. Prefer an interactive graph to a still one: let the child change the slope, move the point or grow the radius, and say in the body what to try and what to watch for, calling a slider by its label, never by its parameter name. The body may mention only sliders and movable points the graph really has: if it says to move something, that parameter must be in the graph's parameters. At most 4 parameters; [] for a still figure. readouts are live numbers shown under the graph, each a label and an expr, such as label \"Distance AB\" and expr \"sqrt((c - a)^2 + (d - b)^2)\"; use them for the quantity the lesson is about. A readout's expr gives one number: never an equation with = and never a pair of coordinates (show a point as two readouts, one for x and one for y). Like every expression, it may use only numbers and the parameter names; x is allowed only inside a function's expr.",
  "numberLines: for whole numbers, negative numbers, fractions, decimals, rounding and inequalities. min, max, step (the distance between labelled ticks; at most 20 ticks), points (value, label, and open: true for a hollow dot at a value that is not included) and ranges (shaded stretches; from and to are numbers written as text, or \"\" when the range runs off that end, as in x > 2).",
  "Every figure must agree exactly with the numbers in the text and in the worked examples. A lesson with no graph or number line still has its checks and its stepped example.",
].join("\n");

export function lessonPrompt(input: GenerateLessonInput): Prompt {
  const size = lessonSize(input.learner.gradeLevel);
  return {
    system: join([
      "You write one lesson for a school child: a body, interactive blocks placed inside it, and a multiple-choice quiz at the end.",
      `The lesson body is Markdown, ${size.minWords} to ${size.maxWords} words, written to the child at their grade level. It is a complete lesson, not a summary: a short hook that says why this is worth knowing; each idea in its own section, explained step by step from what the child already knows; at least two worked examples, the second harder than the first; the typical mistake and how to avoid it; and a recap. Start each section with a ## heading. Call the section that states the main rule "Key idea", a worked example "Worked example: " followed by its problem, and the section on the typical mistake "Watch out". Use lists where they help. No tables, images, links or HTML.`,
      "Put every number sentence, equation and expression in backticks, e.g. `3x + 4 = -11`, and bold each key term once where it is introduced. End the body with one line that starts with **Remember:**.",
      BLOCKS_RULE,
      `Then write the quiz: ${size.questions} questions, ordered from easiest to hardest. Each has exactly ${CHOICES_PER_QUESTION} choices with exactly one correct, a zero-based correctIndex, choiceFeedback, and the one skill it tests, copied exactly from the lesson's skills. choiceFeedback has one entry per choice, in the same order, written to a child who picked that choice, in one or two sentences. For the correct choice, say what they did right ("5 was added, so you subtracted 5"). For a wrong choice, name the slip that leads to it and then show the right way ("You added 3 instead of subtracting it. Subtract first: ..."). Never call the child or the answer wrong, bad or silly. Cover every skill of the lesson at least once. Wrong choices should be the results of typical mistakes, not obviously silly. Vary the position of the correct choice. Every question must be answerable from the lesson alone, and none may need a figure to be seen.`,
      "Work each question and each check out before writing it and make sure the choice at correctIndex really is correct.",
      "Adapt to the learner: use the notes on how this child learns, and go slower where mastery of the lesson's skills is low.",
      STYLE_RULE,
    ]),
    user: join([
      section(
        "Lesson",
        [
          `Subject: ${input.subject}`,
          `Title: ${input.lesson.title}`,
          `Objective: ${input.lesson.objective}`,
          `Skills: ${input.lesson.skills.join(", ")}`,
          KIND_GUIDANCE[input.lesson.kind],
        ].join("\n"),
      ),
      section(
        "Lessons already taught, in order",
        list(input.previousLessonTitles),
      ),
      learnerSection(input.learner),
      sourceSection(input.sourceChunks),
    ]),
  };
}

export function replanPrompt(input: ReplanInput): Prompt {
  const task =
    input.trigger === "struggling"
      ? "The child is struggling. First diagnose: list the specific mistakes they made (what they did, not just the topic) and the skills they are missing, including prerequisite skills the wrong answers reveal. Then propose 1 to 3 remedial lessons that teach those missing skills from the ground up. The failed lessons will be scheduled again automatically after yours, so do not repeat them: prepare the child for them."
      : "The child is excelling. In the diagnosis, summarise what they have clearly mastered; mistakes and missingSkills are usually []. Then propose 1 to 3 extension lessons that build on what they learned and go beyond the remaining plan, without duplicating any remaining lesson.";

  return {
    system: join([
      "You adjust a child's curriculum after their recent quiz results.",
      task,
      "The diagnosis summary is 1 to 2 sentences addressed to the parent, specific and kind. The diagnosis childMessage is 1 to 2 sentences addressed to the child about the same change: warm, concrete, at their grade level, with no scores and no words like failed or wrong.",
      'Each new lesson has a title, a one-sentence objective, 1 to 3 skills and a reason: one sentence of at most 25 words to the child on why this lesson was added, naming what in their answers led to it ("You mixed up the sign when a negative number moved, so we start there").',
      ESTIMATE_RULE,
      SKILL_RULE,
      STYLE_RULE,
    ]),
    user: join([
      section("Subject", input.subject),
      attemptsSection(input.recentAttempts),
      section(
        "Remaining lessons in the plan",
        list(
          input.remainingLessons.map(
            (lesson) => `${lesson.title}: ${lesson.objective}`,
          ),
        ),
      ),
      learnerSection(input.learner),
      section("Known skills", list(input.knownSkills)),
    ]),
  };
}

export function attemptFeedbackPrompt(input: AttemptFeedbackInput): Prompt {
  const right = input.rightAnswers.map((r) => `[${r.skill}] "${r.prompt}" answered "${r.answer}"`);
  return {
    system: join([
      "You write the message a school child sees right after finishing a quiz, above the per-question review.",
      'Return a headline of at most 8 words ("Nice. The sign is starting to stick.") and a summary of 1 to 2 sentences, at most 35 words, addressed to the child ("You kept the sign right on every \"+\" question. One to look at again, below.").',
      "Be specific: name what the right answers have in common and, if there were misses, the one pattern worth another look. Do not repeat the score as a number and do not explain the answers; the review below does that.",
      "Be warm and honest at the child's grade level. Never use the words wrong, failed, bad or mistake; a miss is something worth another look. Do not overpraise a low score: say it was tricky and that it shows what to practise.",
      STYLE_RULE,
    ]),
    user: join([
      section("Learner", `Grade level: ${input.gradeLevel}\nSubject: ${input.subject}`),
      attemptsSection([input.attempt]),
      section("Right answers", list(right)),
    ]),
  };
}

export function learnerNotesPrompt(input: UpdateLearnerNotesInput): Prompt {
  return {
    system: join([
      "You keep short notes on how one child learns, used to tailor future lessons in every subject.",
      "Update the previous notes with what the recent quiz attempts show. Keep what is still true, revise what the new evidence contradicts, and add new patterns: strengths, recurring kinds of mistake, and what style of explanation should help.",
      "Write at most 80 words of plain prose. Describe patterns, not individual questions. Do not speculate beyond the evidence and do not give scores.",
    ]),
    user: join([
      section("Grade level", String(input.gradeLevel)),
      section("Previous notes", input.previousNotes || "(none yet)"),
      attemptsSection(input.recentAttempts),
    ]),
  };
}

// Each chunk is shown by its opening only: enough to see the headings and
// what the text is about, at a fraction of the tokens of the whole book.
const MAP_PREVIEW_CHARS = 500;

export function bookMapPrompt(title: string, chunks: string[]): Prompt {
  return {
    system: join([
      "You map the structure of a school textbook so that lessons can be planned from it. You are given the opening of every chunk of the book's text, in reading order, each numbered in brackets.",
      "Return the book's sections in reading order. A section is a stretch of the book that teaches one topic, about what one lesson can cover: normally the book's own numbered sections or lessons, not whole chapters and not single paragraphs. Front matter, tables of contents, answer keys and indexes are not sections; leave them inside whichever section they fall in.",
      'For each section give: chapter, the heading of the chapter it belongs to as printed, or "" if the book has no chapters; title, the section\'s own heading as printed; summary, one or two sentences on what it teaches, using the book\'s own terms; and firstChunk, the number of the chunk where the section starts. firstChunk values must be strictly increasing, and the first section starts at chunk 0.',
      "Use only what the text shows. Do not invent sections the book does not have.",
    ]),
    user: join([
      section("Book title", title),
      section(
        "Chunks",
        chunks
          .map((chunk, index) => {
            const preview =
              chunk.length > MAP_PREVIEW_CHARS
                ? `${chunk.slice(0, MAP_PREVIEW_CHARS)}…`
                : chunk;
            return `[${index}]\n${preview}`;
          })
          .join("\n\n"),
      ),
    ]),
  };
}
