import "server-only";
import {
  EMBEDDING_DIMENSIONS,
  type AiService,
  type AttemptFeedbackInput,
  type GenerateLessonInput,
  type GenerateOutlineInput,
  type PlannedLesson,
  type OutlineResult,
  type PrepareBookInput,
  type PreparedBook,
  type ReplanInput,
  type UpdateLearnerNotesInput,
} from "@/contracts/ai";
import { CHOICES_PER_QUESTION, type BookSection, type LessonContent } from "@/contracts/domain";

// Deterministic stand-in for lib/ai, used until the real module is wired in
// and in tests. Every output satisfies the contracts in contracts/ai.ts.

const label = (slug: string) => slug.replaceAll("-", " ");

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "general";
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Bag-of-words vector: texts sharing words are close in cosine distance. */
export function fakeEmbedding(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    v[hash(word) % EMBEDDING_DIMENSIONS] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm === 0) {
    v[0] = 1;
    return v;
  }
  return v.map((x) => x / norm);
}

const HEADING = /^(#{1,3}\s+\S|chapter\b|section\b|unit\b)/i;

function chunk(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (HEADING.test(p) && current) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${p}` : p;
    if (current.length > 800) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

const OUTLINE_STEPS = [
  { title: "Foundations", objective: "Recall the basics this topic builds on." },
  { title: "Core ideas", objective: "Understand the main ideas step by step." },
  { title: "Guided practice", objective: "Solve typical problems with hints." },
  { title: "Putting it together", objective: "Apply everything without help." },
];

export const fakeAi: AiService = {
  async generateOutline(input: GenerateOutlineInput): Promise<OutlineResult> {
    const words = input.prompt.trim().split(/\s+/).filter(Boolean);
    if (input.clarifications.length === 0 && words.length < 3) {
      return {
        kind: "questions",
        questions: ["Which topic should we focus on?", "What feels hardest right now?"],
      };
    }
    const topic = slugify(words.slice(0, 4).join(" "));
    const sections = input.bookSections;
    return {
      kind: "outline",
      outline: {
        subject: "General",
        title: input.prompt.trim().slice(0, 60),
        lessons: OUTLINE_STEPS.map((step, i) => ({
          title: sections.length ? `${step.title}: ${sections[i % sections.length].title}` : step.title,
          objective: step.objective,
          skills: [i === 0 && input.knownSkills[0] ? input.knownSkills[0] : `${topic}-${slugify(step.title)}`],
          bookSectionIndex: sections.length ? sections[i % sections.length].index : null,
          estimatedMinutes: 6 + i * 2,
        })),
      },
    };
  },

  async generateLesson(input: GenerateLessonInput): Promise<LessonContent> {
    const skills = input.lesson.skills.length ? input.lesson.skills : ["general"];
    const questions = [0, 1, 2].map((n) => {
      const skill = skills[n % skills.length];
      const correctIndex = n % CHOICES_PER_QUESTION;
      const wrong = ["A common mistake", "A partly right answer", "An unrelated answer"];
      const choices = Array.from({ length: CHOICES_PER_QUESTION }, (_, c) =>
        c === correctIndex ? "The correct answer" : wrong.pop()!,
      );
      const explanation = `It applies ${label(skill)} the way the lesson explains.`;
      return {
        id: crypto.randomUUID(),
        prompt: `Question ${n + 1}: which answer shows ${label(skill)}?`,
        choices,
        correctIndex,
        explanation,
        choiceFeedback: choices.map((c, i) =>
          i === correctIndex ? explanation : `"${c}" comes from a slip with ${label(skill)}. Go back one step and redo it.`,
        ),
        skill,
      };
    });
    const source = input.sourceChunks.length
      ? `\n\n### From the book\n\n${input.sourceChunks[0].slice(0, 300)}`
      : "";
    return {
      bodyMarkdown: `## ${input.lesson.title}\n\n${input.lesson.objective}\n\n### Key idea\n\nSample lesson about **${label(skills[0])}**.${source}`,
      questions,
    };
  },

  async replan(input: ReplanInput) {
    if (input.trigger === "excelling") {
      return {
        diagnosis: {
          summary: "The last lessons went very well.",
          childMessage: "You are ahead of the plan, so we added a challenge lesson at the end.",
          mistakes: [],
          missingSkills: [],
        },
        newLessons: [
          {
            title: "Challenge: going further",
            objective: "Harder problems for a learner who is ahead.",
            skills: ["advanced-problems"],
            reason: "You got nearly everything right, so here is something harder.",
            estimatedMinutes: 12,
          },
        ],
      };
    }
    const wrong = input.recentAttempts.flatMap((a) => a.wrongAnswers);
    const missingSkills = [...new Set(wrong.map((w) => w.skill))].slice(0, 2);
    const newLessons: PlannedLesson[] = missingSkills.map((skill) => ({
      title: `Review: ${label(skill)}`,
      objective: `Rebuild ${label(skill)} from the ground up.`,
      skills: [skill],
      reason: `Your answers on ${label(skill)} went different ways, so we start from the idea underneath it.`,
      estimatedMinutes: 6,
    }));
    return {
      diagnosis: {
        summary: "The last lessons were too hard, so review lessons come first.",
        childMessage: "A couple of short lessons come first, so the next part feels easier.",
        mistakes: missingSkills.map((s) => `Several wrong answers on ${label(s)}.`),
        missingSkills,
      },
      newLessons,
    };
  },

  async updateLearnerNotes(input: UpdateLearnerNotesInput) {
    const scores = input.recentAttempts.map((a) => a.score);
    const avg = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : 0;
    return {
      notes: `Grade ${input.gradeLevel} learner. Recent average score ${Math.round(avg * 100)}%.`,
    };
  },

  async writeAttemptFeedback(input: AttemptFeedbackInput) {
    const misses = input.attempt.wrongAnswers.length;
    return {
      headline: misses ? "Good effort." : "All of them held up.",
      summary: misses
        ? `${label(input.attempt.wrongAnswers[0].skill)} is worth another look, below.`
        : `You got every ${label(input.rightAnswers[0]?.skill ?? "question")} question.`,
    };
  },

  async prepareBook(input: PrepareBookInput): Promise<PreparedBook> {
    const chunks = chunk(input.text);
    const sections: BookSection[] = [];
    const sectionOf: number[] = [];
    chunks.forEach((c, i) => {
      const startsSection = i === 0 || HEADING.test(c) || (i % 4 === 0 && !chunks.some((x) => HEADING.test(x)));
      if (startsSection) {
        const firstLine = c.split("\n")[0].replace(/^#+\s*/, "").slice(0, 80);
        sections.push({
          index: sections.length,
          chapter: "",
          title: firstLine || `Part ${sections.length + 1}`,
          summary: c.slice(0, 120),
        });
      }
      sectionOf.push(sections.length - 1);
    });
    return {
      sections,
      chunks: chunks.map((content, i) => ({
        content,
        sectionIndex: sectionOf[i],
        embedding: fakeEmbedding(content),
      })),
    };
  },

  async embed(texts: string[]) {
    return texts.map(fakeEmbedding);
  },
};
