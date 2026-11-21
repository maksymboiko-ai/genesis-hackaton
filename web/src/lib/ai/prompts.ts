// Every prompt in the app. Each builder returns the system and user message
// for one task; the output shape is enforced separately by the JSON schema.
import type {
  GenerateLessonInput,
  GenerateOutlineInput,
  LessonAttemptSummary,
  ReplanInput,
  UpdateLearnerNotesInput,
} from "@/contracts/ai";
import {
  CHOICES_PER_QUESTION,
  MAX_CLARIFYING_QUESTIONS,
  type BookSection,
  type LearnerProfile,
} from "@/contracts/domain";

export type Prompt = { system: string; user: string };

// The product is for the US market.
const STYLE_RULE =
  "Write in American English and follow US school conventions: grade levels, spelling, units and math notation.";

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
    "Base the content on these excerpts: follow their order of topics and their notation, and do not contradict them. Teach the method the way the excerpts teach it, and call every method, rule, step and check by the name the excerpts give it, so the lesson matches what the child sees in the book. Where they do not cover something, teach it in the same style.\n\n" +
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
  const bookRule = hasBook
    ? "The curriculum teaches from the family's textbook, whose sections are listed in the book map. Plan 5 to 15 lessons: one lesson per section that the goal covers, in the book's order, using the book's own terms in titles and objectives. If the goal is the whole book and it has more sections than that, teach the ones that matter most at this grade. Set each lesson's bookSectionIndex to the number in brackets of the section it is taught from, or -1 for a lesson (such as a prerequisite the learner is missing) that no section covers."
    : "Plan 5 to 8 lessons. There is no textbook, so set every lesson's bookSectionIndex to -1.";

  return {
    system: join([
      "You design personal curricula for school children. From a goal stated by a parent or child you plan an ordered list of short lessons.",
      "Each lesson has a title, a one-sentence objective saying what the child will be able to do, and the 1 to 3 skills it teaches. Order the lessons so each builds on the ones before it.",
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

const KIND_GUIDANCE: Record<GenerateLessonInput["lesson"]["kind"], string> = {
  core: "This is a regular lesson in the curriculum.",
  remedial:
    "This is a remedial lesson: the child recently got questions on these skills wrong. Assume the earlier explanation did not work. Start from the prerequisite idea, use a different explanation and simpler numbers or examples, and go one small step at a time.",
  retry:
    "This is a second try at a lesson the child failed, after remedial lessons. Teach the same objective with a fresh explanation and new examples and questions; do not assume the child remembers the first version.",
  extension:
    "This is an extension lesson for a child who is excelling. Skip the basics, go deeper than the curriculum requires, and make the questions genuinely challenging.",
};

export function lessonPrompt(input: GenerateLessonInput): Prompt {
  return {
    system: join([
      "You write one lesson for a school child, followed by a multiple-choice quiz.",
      "The lesson body is Markdown, 250 to 450 words, written to the child at their grade level: a short hook, the idea explained step by step, at least one fully worked example, and a one-line recap. Use headings and lists. No tables, images or links.",
      `Then write 4 or 5 quiz questions. Each has exactly ${CHOICES_PER_QUESTION} choices with exactly one correct, a zero-based correctIndex, a one or two sentence explanation of why the correct choice is right, and the one skill it tests, copied exactly from the lesson's skills. Cover every skill of the lesson at least once. Wrong choices should be the results of typical mistakes, not obviously silly. Vary the position of the correct choice. Every question must be answerable from the lesson body alone.`,
      "Work each question out before writing it and make sure the choice at correctIndex really is correct.",
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
      "The diagnosis summary is 1 to 2 sentences addressed to the parent, specific and kind. Each new lesson has a title, a one-sentence objective and 1 to 3 skills.",
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
