// Eval cases. Each one calls a real AiService function with fixture input and
// returns the list of checks that failed ([] means the case passed). A thrown
// error (invalid output after the retry) is counted by the runner.
import type {
  AiCallOptions,
  AiService,
  LessonAttemptSummary,
  LessonOutline,
  OutlineLesson,
  PreparedBook,
} from "@/contracts/ai";
import type { BookSection, LearnerProfile } from "@/contracts/domain";
import { BOOK_SECTION_TITLES, BOOK_TEXT, BOOK_TITLE } from "./fixtures/book";
import { LONG_BOOK, PLAIN_BOOK, type MapBook } from "./fixtures/map-books";

export type EvalCase = {
  name: string;
  task: "outline" | "lesson" | "replan" | "learner_notes" | "book_map";
  run: (ai: AiService, options: AiCallOptions) => Promise<string[]>;
};

function words(text: string): number {
  return text.trim().split(/\s+/).length;
}

function failures(checks: Record<string, boolean>): string[] {
  return Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
}

// --- Fixtures ---------------------------------------------------------------

const newLearner = (gradeLevel: number): LearnerProfile => ({
  gradeLevel,
  notes: "",
  mastery: [],
});

const weakFractions: LearnerProfile = {
  gradeLevel: 6,
  notes:
    "Rushes through multi-step problems and skips writing intermediate steps. Understands better with pictures and real-life examples.",
  mastery: [
    { subject: "arithmetic", skill: "simplifying-fractions", mastery: 0.22 },
    { subject: "arithmetic", skill: "multiplying-fractions", mastery: 0.31 },
    { subject: "biology", skill: "cell-structure", mastery: 0.93 },
  ],
};

const strongAlgebra: LearnerProfile = {
  gradeLevel: 7,
  notes: "Quick with procedures, enjoys puzzles and harder challenge problems.",
  mastery: [
    { subject: "algebra", skill: "solving-linear-equations", mastery: 0.95 },
    { subject: "algebra", skill: "combining-like-terms", mastery: 0.91 },
  ],
};

// The fixture book's map, as prepareBook should produce it.
const BOOK_SECTIONS: BookSection[] = [
  { chapter: "Chapter 3 Fractions", title: "3.1 Twin Fractions", summary: "Twin Fractions name the same amount; make one by multiplying numerator and denominator by the same number." },
  { chapter: "Chapter 3 Fractions", title: "3.2 Simplest Form", summary: "Reach Simplest Form by dividing numerator and denominator by their greatest common factor." },
  { chapter: "Chapter 3 Fractions", title: "3.3 Adding Fractions with Unlike Denominators", summary: "Swap fractions for Twin Fractions on a Common Ground (the least common multiple), then add the numerators." },
  { chapter: "Chapter 4 Equations", title: "4.1 The Scales Method", summary: "An equation is a pair of scales; the Golden Rule is to do the same to both pans." },
  { chapter: "Chapter 4 Equations", title: "4.2 Undoing Operations", summary: "Solve one-step equations by undoing the operation on both pans, then run a Scales Check." },
  { chapter: "Chapter 4 Equations", title: "4.3 Two-Step Equations", summary: "Undo two operations in reverse order, addition or subtraction first." },
  { chapter: "Chapter 5 Ratios and Rates", title: "5.1 Ratios", summary: "A ratio compares two amounts; scale and simplify it like Twin Fractions." },
  { chapter: "Chapter 5 Ratios and Rates", title: "5.2 The Rate Table", summary: "Solve rate problems in a Rate Table by building the unit rate column first." },
].map((section, index) => ({ index, ...section }));

function sectionText(title: string): string {
  const start = BOOK_TEXT.indexOf(`\n${title}\n`);
  const next = BOOK_SECTION_TITLES[BOOK_SECTION_TITLES.indexOf(title) + 1];
  const end = next ? BOOK_TEXT.indexOf(`\n${next}\n`) : BOOK_TEXT.length;
  return BOOK_TEXT.slice(start, end).trim();
}

// Strips the numbering from a printed heading: "4.2 Undoing Operations" and
// "Lesson 3 Rivers and Lakes" both become the topic alone, lowercased.
function topicOf(heading: string): string {
  return heading.replace(/^(lesson\s+)?[\d.]+\s+/i, "").toLowerCase();
}

// Compares a prepared book with the headings it was built from: which printed
// sections the map lacks, and which have their heading chunk in another section.
function compareMap(book: PreparedBook, expected: MapBook) {
  const found = book.sections.map((s) => s.title.toLowerCase());
  const missing = expected.sectionTitles.filter((title) => !found.some((f) => f.includes(topicOf(title))));
  const misplaced = expected.sectionTitles.filter((title) => {
    const chunk = book.chunks.find((c) => c.content.includes(`${title}\n`));
    const section = chunk && book.sections[chunk.sectionIndex];
    return !section || !section.title.toLowerCase().includes(topicOf(title));
  });
  return { missing, misplaced };
}

// What a replan tells the family about the change: short, to the right
// reader, and without verdicts.
function explanationChecks(result: Awaited<ReturnType<AiService["replan"]>>): Record<string, boolean> {
  const { summary, childMessage } = result.diagnosis;
  const toChild = [childMessage, ...result.newLessons.map((l) => l.reason)];
  return {
    "child message is at most 50 words": words(childMessage) <= 50,
    "child message differs from the parent summary": childMessage !== summary,
    "every reason is one sentence of at most 35 words": result.newLessons.every((l) => words(l.reason) <= 35),
    "nothing said to the child mentions scores or failing": !toChild.some((text) => /\d+\s?%|bfail|bwrongb/i.test(text)),
  };
}

function sample(items: string[]): string {
  if (!items.length) return "none";
  return items.length > 4 ? `${items.slice(0, 4).join(", ")}, …` : items.join(", ");
}

// What the backend passes for a lesson on section 4.3: that section's text.
const TWO_STEP_CHUNKS = [sectionText("4.3 Two-Step Equations")];

const equationsLesson: LessonOutline = {
  title: "Solving one-step equations",
  objective: "Solve equations of the form x + a = b and ax = b.",
  skills: ["solving-one-step-equations", "inverse-operations"],
};

const strugglingAttempts: LessonAttemptSummary[] = [
  {
    lesson: {
      title: "Adding and subtracting negative numbers",
      objective: "Add and subtract integers with different signs.",
      skills: ["adding-negative-numbers", "subtracting-negative-numbers"],
    },
    score: 0.4,
    wrongAnswers: [
      { prompt: "What is -3 + 7?", chosen: "-10", correct: "4", skill: "adding-negative-numbers" },
      { prompt: "What is 5 - (-2)?", chosen: "3", correct: "7", skill: "subtracting-negative-numbers" },
      { prompt: "What is -6 - 4?", chosen: "-2", correct: "-10", skill: "subtracting-negative-numbers" },
    ],
  },
  {
    lesson: equationsLesson,
    score: 0.5,
    wrongAnswers: [
      { prompt: "Solve x + 9 = 4", chosen: "x = 5", correct: "x = -5", skill: "solving-one-step-equations" },
      { prompt: "Solve x - 3 = -8", chosen: "x = -11", correct: "x = -5", skill: "inverse-operations" },
    ],
  },
  {
    lesson: {
      title: "Solving two-step equations",
      objective: "Solve equations of the form ax + b = c.",
      skills: ["solving-two-step-equations"],
    },
    score: 0.25,
    wrongAnswers: [
      { prompt: "Solve 2x + 7 = 1", chosen: "x = 3", correct: "x = -3", skill: "solving-two-step-equations" },
      { prompt: "Solve 3x - 5 = -14", chosen: "x = 3", correct: "x = -3", skill: "solving-two-step-equations" },
      { prompt: "Solve -4x + 2 = 10", chosen: "x = 2", correct: "x = -2", skill: "solving-two-step-equations" },
    ],
  },
];

const excellingAttempts: LessonAttemptSummary[] = [
  { lesson: equationsLesson, score: 1, wrongAnswers: [] },
  {
    lesson: {
      title: "Solving two-step equations",
      objective: "Solve equations of the form ax + b = c.",
      skills: ["solving-two-step-equations"],
    },
    score: 1,
    wrongAnswers: [],
  },
  {
    lesson: {
      title: "Equations with brackets",
      objective: "Expand brackets and solve the resulting equation.",
      skills: ["expanding-brackets", "solving-linear-equations"],
    },
    score: 0.8,
    wrongAnswers: [
      { prompt: "Solve 2(x + 3) = 14", chosen: "x = 5.5", correct: "x = 4", skill: "expanding-brackets" },
    ],
  },
];

const remainingLessons: LessonOutline[] = [
  {
    title: "Equations with the unknown on both sides",
    objective: "Solve equations such as 3x + 2 = x + 10.",
    skills: ["solving-linear-equations"],
  },
  {
    title: "Word problems with equations",
    objective: "Write and solve an equation for a word problem.",
    skills: ["modelling-with-equations"],
  },
];

// --- Shared checks ------------------------------------------------------------

async function outlineCase(
  ai: AiService,
  options: AiCallOptions,
  input: Parameters<AiService["generateOutline"]>[0],
  extra: (lessons: OutlineLesson[], title: string, subject: string) => Record<string, boolean>,
): Promise<string[]> {
  const result = await ai.generateOutline(input, options);
  if (result.kind !== "outline") return ["asked questions for a clear goal"];
  const { lessons, title, subject } = result.outline;
  const maxLessons = input.bookSections.length ? 15 : 8;
  return failures({
    [`5 to ${maxLessons} lessons`]: lessons.length >= 5 && lessons.length <= maxLessons,
    "no section without a book":
      input.bookSections.length > 0 || lessons.every((l) => l.bookSectionIndex === null),
    "1 to 3 skills per lesson": lessons.every((l) => l.skills.length >= 1 && l.skills.length <= 3),
    ...extra(lessons, title, subject),
  });
}

async function questionsCase(
  ai: AiService,
  options: AiCallOptions,
  prompt: string,
): Promise<string[]> {
  const result = await ai.generateOutline(
    { prompt, clarifications: [], learner: newLearner(5), knownSkills: [], bookSections: [] },
    options,
  );
  if (result.kind !== "questions") return ["planned a curriculum for a vague goal"];
  return failures({
    "1 to 3 questions": result.questions.length >= 1 && result.questions.length <= 3,
    "every question ends with a question mark": result.questions.every((q) => q.endsWith("?")),
  });
}

async function lessonCase(
  ai: AiService,
  options: AiCallOptions,
  input: Parameters<AiService["generateLesson"]>[0],
  extra: (body: string) => Record<string, boolean>,
): Promise<string[]> {
  const content = await ai.generateLesson(input, options);
  const tested = new Set(content.questions.map((q) => q.skill));
  const bodyWords = words(content.bodyMarkdown);
  return failures({
    "4 or 5 questions": content.questions.length >= 4 && content.questions.length <= 5,
    "every skill tested": input.lesson.skills.every((skill) => tested.has(skill)),
    "body is 150 to 700 words": bodyWords >= 150 && bodyWords <= 700,
    "correct choice position varies":
      new Set(content.questions.map((q) => q.correctIndex)).size > 1,
    "every question has an explanation": content.questions.every((q) => q.explanation.length > 0),
    // The feedback for a wrong choice must be its own text, not the
    // explanation of the right answer repeated.
    "wrong choices get their own feedback": content.questions.every(
      (q) => new Set(q.choiceFeedback).size === q.choiceFeedback.length,
    ),
    "feedback never says wrong or incorrect": !content.questions.some((q) =>
      q.choiceFeedback.some((text) => /b(wrong|incorrect|silly)b/i.test(text)),
    ),
    "math is in backticks": /`[^`]*\d[^`]*`/.test(content.bodyMarkdown),
    "ends with a Remember line": /\*\*Remember:?\*\*/.test(content.bodyMarkdown),
    ...extra(content.bodyMarkdown),
  });
}

// --- Cases ------------------------------------------------------------------

export const CASES: EvalCase[] = [
  {
    name: "outline: clear goal",
    task: "outline",
    run: (ai, options) =>
      outlineCase(
        ai,
        options,
        {
          prompt: "My daughter got a B in algebra, she struggles with linear equations.",
          clarifications: [],
          learner: newLearner(7),
          knownSkills: [],
          bookSections: [],
        },
        (_, __, subject) => ({ "subject is algebra": subject.includes("algebra") }),
      ),
  },
  {
    name: "outline: vague goal asks questions",
    task: "outline",
    run: (ai, options) => questionsCase(ai, options, "Help my kid do better at school."),
  },
  {
    name: "outline: one-word goal asks questions",
    task: "outline",
    run: (ai, options) => questionsCase(ai, options, "Tutoring"),
  },
  {
    name: "outline: answers given, never asks twice",
    task: "outline",
    run: (ai, options) =>
      outlineCase(
        ai,
        options,
        {
          prompt: "Help my kid do better at school.",
          clarifications: [
            { question: "Which subject needs the most help?", answer: "Math, I think. Not sure which part." },
          ],
          learner: newLearner(5),
          knownSkills: [],
          bookSections: [],
        },
        () => ({}),
      ),
  },
  {
    name: "outline: reuses known skill slugs",
    task: "outline",
    run: (ai, options) =>
      outlineCase(
        ai,
        options,
        {
          prompt: "More practice solving linear equations and simplifying expressions.",
          clarifications: [],
          learner: newLearner(7),
          knownSkills: ["solving-linear-equations", "combining-like-terms", "cell-structure"],
          bookSections: [],
        },
        (lessons) => {
          const used = new Set(lessons.flatMap((l) => l.skills));
          return {
            "reuses solving-linear-equations": used.has("solving-linear-equations"),
            "reuses combining-like-terms": used.has("combining-like-terms"),
            "no unrelated known skill": !used.has("cell-structure"),
          };
        },
      ),
  },
  {
    name: "outline: weak prerequisite gets revisited (evolution)",
    task: "outline",
    run: (ai, options) =>
      outlineCase(
        ai,
        options,
        {
          prompt: "We need to learn ratios and proportions for 6th grade math.",
          clarifications: [],
          learner: weakFractions,
          knownSkills: weakFractions.mastery.map((m) => m.skill),
          bookSections: [],
        },
        (lessons) => ({
          "revisits a weak fractions skill": lessons.some((l) =>
            l.skills.some((s) => s === "simplifying-fractions" || s === "multiplying-fractions"),
          ),
        }),
      ),
  },
  {
    name: "outline: strong learner skips mastered basics (evolution)",
    task: "outline",
    run: (ai, options) =>
      outlineCase(
        ai,
        options,
        {
          prompt: "Algebra for 7th grade: equations.",
          clarifications: [],
          learner: strongAlgebra,
          knownSkills: strongAlgebra.mastery.map((m) => m.skill),
          bookSections: [],
        },
        (lessons) => ({
          "first lesson is not a mastered skill only": !lessons[0].skills.every(
            (s) => s === "solving-linear-equations" || s === "combining-like-terms",
          ),
        }),
      ),
  },
  {
    name: "outline: whole book follows the map (RAG)",
    task: "outline",
    run: (ai, options) =>
      outlineCase(
        ai,
        options,
        {
          prompt: "Teach my son everything in his 6th grade math book.",
          clarifications: [],
          learner: newLearner(6),
          knownSkills: [],
          bookSections: BOOK_SECTIONS,
        },
        (lessons) => {
          const used = lessons.map((l) => l.bookSectionIndex).filter((i) => i !== null);
          return {
            "covers every section": BOOK_SECTIONS.every((s) => used.includes(s.index)),
            "follows the book's order": used.every((index, i) => i === 0 || index >= used[i - 1]),
            "uses the book's terms": lessons.some((l) => /scales|twin fractions|rate table/i.test(`${l.title} ${l.objective}`)),
          };
        },
      ),
  },
  {
    name: "outline: goal covers one chapter of the book (RAG)",
    task: "outline",
    run: (ai, options) =>
      outlineCase(
        ai,
        options,
        {
          prompt: "She has a test on the equations chapter of her math book next week.",
          clarifications: [],
          learner: newLearner(6),
          knownSkills: [],
          bookSections: BOOK_SECTIONS,
        },
        (lessons) => {
          const used = lessons.map((l) => l.bookSectionIndex).filter((i) => i !== null);
          return {
            "covers the three equations sections": [3, 4, 5].every((index) => used.includes(index)),
            "leaves out the ratios chapter": !used.includes(6) && !used.includes(7),
          };
        },
      ),
  },
  {
    name: "book map: finds the book's sections (RAG)",
    task: "book_map",
    run: async (ai, options) => {
      const book = await ai.prepareBook({ title: BOOK_TITLE, text: BOOK_TEXT }, options);
      const found = book.sections.map((s) => s.title.toLowerCase());
      const missing = BOOK_SECTION_TITLES.filter(
        (title) => !found.some((f) => f.includes(title.slice(4).toLowerCase())),
      );
      // Each printed section should own the chunk that holds its heading.
      const misplaced = BOOK_SECTION_TITLES.filter((title) => {
        const chunk = book.chunks.find((c) => c.content.includes(`${title}\n`));
        const section = chunk && book.sections[chunk.sectionIndex];
        return !section || !section.title.toLowerCase().includes(title.slice(4).toLowerCase());
      });
      return failures({
        [`finds all 8 sections (missing: ${missing.join(", ") || "none"})`]: missing.length === 0,
        "no invented sections": book.sections.length <= BOOK_SECTION_TITLES.length + 1,
        [`chunks sit in their own section (misplaced: ${misplaced.join(", ") || "none"})`]: misplaced.length === 0,
        "names the chapter": book.sections.every((s) => /chapter/i.test(s.chapter)),
        "every chunk has a section": book.chunks.every((c) => c.sectionIndex >= 0 && c.sectionIndex < book.sections.length),
      });
    },
  },
  {
    name: "book map: long book, 60 sections (RAG)",
    task: "book_map",
    run: async (ai, options) => {
      const book = await ai.prepareBook({ title: LONG_BOOK.title, text: LONG_BOOK.text }, options);
      const { missing, misplaced } = compareMap(book, LONG_BOOK);
      // "7.3 Percent of a Number" belongs to the chapter printed as "Chapter 7 ...".
      const wrongChapter = book.sections.filter((s) => {
        const number = /^(\d+)\.\d+/.exec(s.title.trim())?.[1];
        return number !== undefined && !new RegExp(`chapter ${number}\\b`, "i").test(s.chapter);
      });
      return failures({
        [`finds all 60 sections (missing ${missing.length}: ${sample(missing)})`]: missing.length === 0,
        [`no invented sections (returned ${book.sections.length})`]: book.sections.length <= LONG_BOOK.sectionTitles.length + 1,
        [`chunks sit in their own section (misplaced ${misplaced.length}: ${sample(misplaced)})`]: misplaced.length === 0,
        [`names the right chapter (wrong on ${wrongChapter.length})`]: wrongChapter.length === 0,
      });
    },
  },
  {
    name: "book map: no chapters, glossary and answer key (RAG)",
    task: "book_map",
    run: async (ai, options) => {
      const book = await ai.prepareBook({ title: PLAIN_BOOK.title, text: PLAIN_BOOK.text }, options);
      const { missing, misplaced } = compareMap(book, PLAIN_BOOK);
      const backMatter = book.sections.filter((s) => /glossary|answer key|in this book|contents/i.test(s.title));
      const chapters = [...new Set(book.sections.map((s) => s.chapter).filter(Boolean))];
      return failures({
        [`finds all 6 lessons (missing: ${sample(missing)})`]: missing.length === 0,
        [`front and back matter are not sections (got: ${sample(backMatter.map((s) => s.title))})`]: backMatter.length === 0,
        [`no invented sections (returned ${book.sections.length})`]: book.sections.length <= PLAIN_BOOK.sectionTitles.length,
        [`chunks sit in their own section (misplaced: ${sample(misplaced)})`]: misplaced.length === 0,
        [`chapter is "" when the book has none (got: ${sample(chapters)})`]: chapters.length === 0,
      });
    },
  },
  {
    name: "lesson: core",
    task: "lesson",
    run: (ai, options) =>
      lessonCase(
        ai,
        options,
        {
          subject: "algebra",
          lesson: { ...equationsLesson, kind: "core" },
          learner: newLearner(7),
          previousLessonTitles: ["What is a variable?"],
          sourceChunks: [],
        },
        () => ({}),
      ),
  },
  {
    name: "lesson: remedial",
    task: "lesson",
    run: (ai, options) =>
      lessonCase(
        ai,
        options,
        {
          subject: "arithmetic",
          lesson: {
            title: "Common denominators: why you can't add the bottoms",
            objective: "Rewrite two fractions with a common denominator before adding them.",
            skills: ["finding-common-denominators"],
            kind: "remedial",
          },
          learner: weakFractions,
          previousLessonTitles: ["Simplifying fractions", "Adding fractions with unlike denominators"],
          sourceChunks: [],
        },
        () => ({}),
      ),
  },
  {
    name: "lesson: follows the textbook (RAG)",
    task: "lesson",
    run: (ai, options) =>
      lessonCase(
        ai,
        options,
        {
          subject: "algebra",
          lesson: {
            title: "Solving two-step equations",
            objective: "Solve equations of the form ax + b = c.",
            skills: ["solving-two-step-equations"],
            kind: "core",
          },
          learner: newLearner(6),
          previousLessonTitles: ["Solving one-step equations"],
          sourceChunks: TWO_STEP_CHUNKS,
        },
        (body) => ({
          "uses the book's pans": /\bpans?\b/i.test(body),
          "uses the book's Scales Check": /scales check/i.test(body),
        }),
      ),
  },
  {
    name: "lesson: extension",
    task: "lesson",
    run: (ai, options) =>
      lessonCase(
        ai,
        options,
        {
          subject: "algebra",
          lesson: {
            title: "Equations with fractions on both sides",
            objective: "Solve linear equations with fractional coefficients by clearing denominators.",
            skills: ["clearing-denominators", "solving-linear-equations"],
            kind: "extension",
          },
          learner: strongAlgebra,
          previousLessonTitles: ["Solving two-step equations", "Equations with brackets"],
          sourceChunks: [],
        },
        () => ({}),
      ),
  },
  {
    name: "replan: struggling finds the sign-error root cause",
    task: "replan",
    run: async (ai, options) => {
      const result = await ai.replan(
        {
          trigger: "struggling",
          subject: "algebra",
          learner: newLearner(7),
          recentAttempts: strugglingAttempts,
          remainingLessons,
          knownSkills: [
            "adding-negative-numbers",
            "subtracting-negative-numbers",
            "solving-one-step-equations",
            "inverse-operations",
            "solving-two-step-equations",
          ],
        },
        options,
      );
      const text = JSON.stringify(result).toLowerCase();
      const missing = result.diagnosis.missingSkills;
      return failures({
        ...explanationChecks(result),
        "1 to 3 remedial lessons": result.newLessons.length >= 1 && result.newLessons.length <= 3,
        "lists mistakes": result.diagnosis.mistakes.length > 0,
        "lists missing skills": missing.length > 0,
        "names negative numbers or signs": /negative|sign/.test(text),
        "reuses a known negative-number slug": [...missing, ...result.newLessons.flatMap((l) => l.skills)].some(
          (s) => s === "adding-negative-numbers" || s === "subtracting-negative-numbers",
        ),
        "does not repeat a failed lesson": !result.newLessons.some((l) =>
          strugglingAttempts.some((a) => a.lesson.title.toLowerCase() === l.title.toLowerCase()),
        ),
      });
    },
  },
  {
    name: "replan: excelling adds extensions",
    task: "replan",
    run: async (ai, options) => {
      const result = await ai.replan(
        {
          trigger: "excelling",
          subject: "algebra",
          learner: strongAlgebra,
          recentAttempts: excellingAttempts,
          remainingLessons,
          knownSkills: ["solving-linear-equations", "combining-like-terms", "expanding-brackets"],
        },
        options,
      );
      const remainingTitles = remainingLessons.map((l) => l.title.toLowerCase());
      return failures({
        ...explanationChecks(result),
        "1 to 3 extension lessons": result.newLessons.length >= 1 && result.newLessons.length <= 3,
        "does not duplicate a remaining lesson": !result.newLessons.some((l) =>
          remainingTitles.includes(l.title.toLowerCase()),
        ),
        "introduces a new skill": result.newLessons.some((l) =>
          l.skills.some((s) => !["solving-linear-equations", "combining-like-terms", "expanding-brackets"].includes(s)),
        ),
      });
    },
  },
  {
    name: "notes: captures the sign-error pattern",
    task: "learner_notes",
    run: async (ai, options) => {
      const { notes } = await ai.updateLearnerNotes(
        {
          previousNotes: "",
          gradeLevel: 7,
          recentAttempts: strugglingAttempts.map((a) => ({ ...a, subject: "algebra" })),
        },
        options,
      );
      return failures({
        "at most 100 words": words(notes) <= 100,
        "mentions negative numbers or signs": /negative|sign/i.test(notes),
      });
    },
  },
  {
    name: "notes: keeps what is still true",
    task: "learner_notes",
    run: async (ai, options) => {
      const { notes } = await ai.updateLearnerNotes(
        {
          previousNotes:
            "Loves football; examples framed as football scores hold her attention. Reads questions carefully.",
          gradeLevel: 7,
          recentAttempts: excellingAttempts.map((a) => ({ ...a, subject: "algebra" })),
        },
        options,
      );
      return failures({
        "at most 100 words": words(notes) <= 100,
        "keeps the football preference": /football/i.test(notes),
      });
    },
  },
];
