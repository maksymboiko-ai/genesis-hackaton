// Eval cases. Each one calls a real AiService function with fixture input and
// returns the list of checks that failed ([] means the case passed). A thrown
// error (invalid output after the retry) is counted by the runner.
import type {
  AiCallOptions,
  AiService,
  LessonAttemptSummary,
  LessonOutline,
} from "@/contracts/ai";
import type { LearnerProfile } from "@/contracts/domain";

export type EvalCase = {
  name: string;
  task: "outline" | "lesson" | "replan" | "learner_notes";
  run: (ai: AiService, options: AiCallOptions) => Promise<string[]>;
};

const CYRILLIC = /[а-яіїєґ]/i;

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

const BOOK_CHUNKS = [
  "Chapter 4. Equations. In this book we solve every equation with the Scales Method. Picture the equation as a pair of scales: the left pan holds the left side, the right pan holds the right side, and the equals sign is the pivot. The scales stay level only if we do the same thing to both pans.",
  "4.2 Undoing operations. To find the unknown we undo operations in reverse order, always on both pans. Worked example: 3x + 4 = 19. Take 4 from both pans: 3x = 15. Share both pans into 3 equal parts: x = 5. Always finish with a Scales Check: put the answer back into the original equation.",
];

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

const strugglingAttemptsUk: LessonAttemptSummary[] = [
  {
    lesson: {
      title: "Скорочення дробів",
      objective: "Скорочувати дроби, ділячи чисельник і знаменник на спільний дільник.",
      skills: ["simplifying-fractions"],
    },
    score: 0.5,
    wrongAnswers: [
      { prompt: "Скороти дріб 6/8", chosen: "2/4", correct: "3/4", skill: "simplifying-fractions" },
      { prompt: "Скороти дріб 9/12", chosen: "3/6", correct: "3/4", skill: "simplifying-fractions" },
    ],
  },
  {
    lesson: {
      title: "Додавання дробів з різними знаменниками",
      objective: "Додавати дроби, зводячи їх до спільного знаменника.",
      skills: ["adding-fractions"],
    },
    score: 0.25,
    wrongAnswers: [
      { prompt: "Обчисли 1/2 + 1/3", chosen: "2/5", correct: "5/6", skill: "adding-fractions" },
      { prompt: "Обчисли 1/4 + 2/3", chosen: "3/7", correct: "11/12", skill: "adding-fractions" },
      { prompt: "Обчисли 3/5 + 1/2", chosen: "4/7", correct: "11/10", skill: "adding-fractions" },
    ],
  },
  {
    lesson: {
      title: "Віднімання дробів",
      objective: "Віднімати дроби з різними знаменниками.",
      skills: ["subtracting-fractions"],
    },
    score: 0.5,
    wrongAnswers: [
      { prompt: "Обчисли 3/4 - 1/3", chosen: "2/1", correct: "5/12", skill: "subtracting-fractions" },
      { prompt: "Обчисли 5/6 - 1/4", chosen: "4/2", correct: "7/12", skill: "subtracting-fractions" },
    ],
  },
];

// --- Shared checks ------------------------------------------------------------

async function outlineCase(
  ai: AiService,
  options: AiCallOptions,
  input: Parameters<AiService["generateOutline"]>[0],
  extra: (lessons: LessonOutline[], title: string, subject: string) => Record<string, boolean>,
): Promise<string[]> {
  const result = await ai.generateOutline(input, options);
  if (result.kind !== "outline") return ["asked questions for a clear goal"];
  const { lessons, title, subject } = result.outline;
  return failures({
    "5 to 8 lessons": lessons.length >= 5 && lessons.length <= 8,
    "1 to 3 skills per lesson": lessons.every((l) => l.skills.length >= 1 && l.skills.length <= 3),
    ...extra(lessons, title, subject),
  });
}

async function questionsCase(
  ai: AiService,
  options: AiCallOptions,
  prompt: string,
  language: "en" | "uk",
): Promise<string[]> {
  const result = await ai.generateOutline(
    { prompt, clarifications: [], learner: newLearner(5), knownSkills: [], sourceChunks: [] },
    options,
  );
  if (result.kind !== "questions") return ["planned a curriculum for a vague goal"];
  return failures({
    "1 to 3 questions": result.questions.length >= 1 && result.questions.length <= 3,
    "questions in the goal's language":
      result.questions.every((q) => CYRILLIC.test(q)) === (language === "uk"),
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
    ...extra(content.bodyMarkdown),
  });
}

// --- Cases ------------------------------------------------------------------

export const CASES: EvalCase[] = [
  {
    name: "outline: clear goal (en)",
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
          sourceChunks: [],
        },
        (_, __, subject) => ({ "subject is algebra": subject.includes("algebra") }),
      ),
  },
  {
    name: "outline: clear goal (uk)",
    task: "outline",
    run: (ai, options) =>
      outlineCase(
        ai,
        options,
        {
          prompt: "Син у 6 класі не розуміє дроби, треба підтягнути перед контрольною.",
          clarifications: [],
          learner: newLearner(6),
          knownSkills: [],
          sourceChunks: [],
        },
        (lessons, title) => ({
          "title in Ukrainian": CYRILLIC.test(title),
          "lesson titles in Ukrainian": lessons.every((l) => CYRILLIC.test(l.title)),
          "slugs stay English": lessons.every((l) => l.skills.every((s) => /[a-z]/.test(s))),
        }),
      ),
  },
  {
    name: "outline: vague goal asks questions (en)",
    task: "outline",
    run: (ai, options) => questionsCase(ai, options, "Help my kid do better at school.", "en"),
  },
  {
    name: "outline: vague goal asks questions (uk)",
    task: "outline",
    run: (ai, options) => questionsCase(ai, options, "Хочу, щоб дитина краще вчилася.", "uk"),
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
          sourceChunks: [],
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
          sourceChunks: [],
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
          sourceChunks: [],
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
          sourceChunks: [],
        },
        (lessons) => ({
          "first lesson is not a mastered skill only": !lessons[0].skills.every(
            (s) => s === "solving-linear-equations" || s === "combining-like-terms",
          ),
        }),
      ),
  },
  {
    name: "outline: follows the textbook (RAG)",
    task: "outline",
    run: (ai, options) =>
      outlineCase(
        ai,
        options,
        {
          prompt: "Teach equations from our 6th grade algebra book.",
          clarifications: [],
          learner: newLearner(6),
          knownSkills: [],
          sourceChunks: BOOK_CHUNKS,
        },
        (lessons) => ({
          "uses the book's Scales Method": lessons.some((l) =>
            /scales/i.test(`${l.title} ${l.objective}`),
          ),
        }),
      ),
  },
  {
    name: "lesson: core (en)",
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
    name: "lesson: remedial (uk)",
    task: "lesson",
    run: (ai, options) =>
      lessonCase(
        ai,
        options,
        {
          subject: "arithmetic",
          lesson: {
            title: "Спільний знаменник: чому не можна додавати знаменники",
            objective: "Зводити два дроби до спільного знаменника перед додаванням.",
            skills: ["finding-common-denominators"],
            kind: "remedial",
          },
          learner: weakFractions,
          previousLessonTitles: ["Скорочення дробів", "Додавання дробів з різними знаменниками"],
          sourceChunks: [],
        },
        (body) => ({ "body in Ukrainian": CYRILLIC.test(body) }),
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
          sourceChunks: BOOK_CHUNKS,
        },
        (body) => ({
          "uses the book's Scales Method": /scales/i.test(body),
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
    name: "replan: struggling (uk)",
    task: "replan",
    run: async (ai, options) => {
      const result = await ai.replan(
        {
          trigger: "struggling",
          subject: "arithmetic",
          learner: weakFractions,
          recentAttempts: strugglingAttemptsUk,
          remainingLessons: [
            {
              title: "Множення дробів",
              objective: "Множити два дроби та скорочувати результат.",
              skills: ["multiplying-fractions"],
            },
          ],
          knownSkills: ["simplifying-fractions", "adding-fractions", "subtracting-fractions", "multiplying-fractions"],
        },
        options,
      );
      return failures({
        "1 to 3 remedial lessons": result.newLessons.length >= 1 && result.newLessons.length <= 3,
        "summary in Ukrainian": CYRILLIC.test(result.diagnosis.summary),
        "lesson titles in Ukrainian": result.newLessons.every((l) => CYRILLIC.test(l.title)),
        "names the common-denominator gap": /denominator/.test(
          [...result.diagnosis.missingSkills, ...result.newLessons.flatMap((l) => l.skills)].join(" "),
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
