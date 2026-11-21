// The AiService implementation. See web/src/contracts/ai.ts for the contract:
// pure functions, validated return values, one retry on invalid output.
import { randomUUID } from "node:crypto";
import {
  BookMapOutput,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  LearnerNotesOutput,
  LessonOutput,
  OutlineDraft,
  ReplanOutput,
  type AiService,
  type LessonOutline,
} from "@/contracts/ai";
import {
  CHOICES_PER_QUESTION,
  LessonContent,
  MAX_CLARIFYING_QUESTIONS,
  type BookSection,
} from "@/contracts/domain";
import { chunkText } from "./chunk";
import { callEmbeddings, callStructured, InvalidOutputError } from "./client";
import { DEFAULT_MODELS } from "./models";
import {
  bookMapPrompt,
  learnerNotesPrompt,
  lessonPrompt,
  outlinePrompt,
  replanPrompt,
  sectionLabel,
} from "./prompts";

// OpenRouter's embeddings endpoint takes a batch; keep requests modest.
const EMBED_BATCH_SIZE = 64;

// Models mostly return clean slugs; normalise the near misses instead of
// spending a retry on them.
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nonEmpty(text: string, what: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new InvalidOutputError(`${what} is empty`);
  return trimmed;
}

// Minutes the model gives a lesson, rounded and kept within 3 to 30; a near
// miss is not worth a retry.
function minutes(value: number, what: string): number {
  if (!Number.isFinite(value)) {
    throw new InvalidOutputError(`${what} estimatedMinutes must be a number`);
  }
  return Math.min(30, Math.max(3, Math.round(value)));
}

function checkLessonOutlines<T extends LessonOutline>(lessons: T[]): T[] {
  if (!lessons.length) throw new InvalidOutputError("lessons is empty");
  return lessons.map((lesson, index) => {
    const skills = [...new Set(lesson.skills.map(toSlug).filter(Boolean))];
    if (!skills.length) {
      throw new InvalidOutputError(`lesson ${index + 1} has no valid skills`);
    }
    return {
      ...lesson,
      title: nonEmpty(lesson.title, `lesson ${index + 1} title`),
      objective: nonEmpty(lesson.objective, `lesson ${index + 1} objective`),
      skills,
    };
  });
}

export const aiService: AiService = {
  generateOutline(input, options) {
    const prompt = outlinePrompt(input);
    return callStructured({
      task: "outline",
      model: options?.model ?? DEFAULT_MODELS.outline,
      ...prompt,
      schemaName: "outline",
      schema: OutlineDraft,
      onCall: options?.onCall,
      check: (draft) => {
        const questions = draft.questions.map((q) => q.trim()).filter(Boolean);
        // One round of questions at most: once answered, only an outline
        // is accepted.
        if (questions.length && !input.clarifications.length) {
          return {
            kind: "questions",
            questions: questions.slice(0, MAX_CLARIFYING_QUESTIONS),
          };
        }
        return {
          kind: "outline",
          outline: {
            subject: nonEmpty(draft.subject, "subject").toLowerCase(),
            title: nonEmpty(draft.title, "title"),
            lessons: checkLessonOutlines(draft.lessons).map((lesson, index) => ({
              ...lesson,
              estimatedMinutes: minutes(lesson.estimatedMinutes, `lesson ${index + 1}`),
              // -1, or anything else that is not a section of this book,
              // means the lesson has no section.
              bookSectionIndex: input.bookSections.some(
                (s) => s.index === lesson.bookSectionIndex,
              )
                ? lesson.bookSectionIndex
                : null,
            })),
          },
        };
      },
    });
  },

  generateLesson(input, options) {
    const prompt = lessonPrompt(input);
    return callStructured({
      task: "lesson",
      model: options?.model ?? DEFAULT_MODELS.lesson,
      ...prompt,
      schemaName: "lesson",
      schema: LessonOutput,
      onCall: options?.onCall,
      check: (output) => {
        const questions = output.questions.map((question, index) => {
          const label = `question ${index + 1}`;
          if (question.choices.length !== CHOICES_PER_QUESTION) {
            throw new InvalidOutputError(
              `${label} must have exactly ${CHOICES_PER_QUESTION} choices`,
            );
          }
          if (new Set(question.choices.map((c) => c.trim())).size !== question.choices.length) {
            throw new InvalidOutputError(`${label} has duplicate choices`);
          }
          if (
            !Number.isInteger(question.correctIndex) ||
            question.correctIndex < 0 ||
            question.correctIndex >= CHOICES_PER_QUESTION
          ) {
            throw new InvalidOutputError(
              `${label} correctIndex must be an integer from 0 to ${CHOICES_PER_QUESTION - 1}`,
            );
          }
          const choiceFeedback = question.choiceFeedback.map((text) => text.trim());
          if (
            choiceFeedback.length !== CHOICES_PER_QUESTION ||
            choiceFeedback.some((text) => !text)
          ) {
            throw new InvalidOutputError(
              `${label} must have feedback for each of its ${CHOICES_PER_QUESTION} choices`,
            );
          }
          const skill = toSlug(question.skill);
          if (!input.lesson.skills.includes(skill)) {
            throw new InvalidOutputError(
              `${label} skill must be one of: ${input.lesson.skills.join(", ")}`,
            );
          }
          return {
            id: randomUUID(),
            prompt: nonEmpty(question.prompt, `${label} prompt`),
            choices: question.choices,
            correctIndex: question.correctIndex,
            explanation: choiceFeedback[question.correctIndex],
            choiceFeedback,
            skill,
          };
        });
        const content = LessonContent.safeParse({
          bodyMarkdown: nonEmpty(output.bodyMarkdown, "bodyMarkdown"),
          questions,
        });
        if (!content.success) {
          throw new InvalidOutputError(content.error.message);
        }
        return content.data;
      },
    });
  },

  replan(input, options) {
    const prompt = replanPrompt(input);
    return callStructured({
      task: "replan",
      model: options?.model ?? DEFAULT_MODELS.replan,
      ...prompt,
      schemaName: "replan",
      schema: ReplanOutput,
      onCall: options?.onCall,
      check: (output) => ({
        diagnosis: {
          summary: nonEmpty(output.diagnosis.summary, "diagnosis summary"),
          childMessage: nonEmpty(
            output.diagnosis.childMessage,
            "diagnosis childMessage",
          ),
          mistakes: output.diagnosis.mistakes
            .map((mistake) => mistake.trim())
            .filter(Boolean),
          missingSkills: [
            ...new Set(
              output.diagnosis.missingSkills.map(toSlug).filter(Boolean),
            ),
          ],
        },
        newLessons: checkLessonOutlines(output.newLessons).map(
          (lesson, index) => ({
            ...lesson,
            reason: nonEmpty(lesson.reason, `lesson ${index + 1} reason`),
            estimatedMinutes: minutes(lesson.estimatedMinutes, `lesson ${index + 1}`),
          }),
        ),
      }),
    });
  },

  updateLearnerNotes(input, options) {
    const prompt = learnerNotesPrompt(input);
    return callStructured({
      task: "learner_notes",
      model: options?.model ?? DEFAULT_MODELS.learner_notes,
      ...prompt,
      schemaName: "learner_notes",
      schema: LearnerNotesOutput,
      onCall: options?.onCall,
      check: (output) => ({ notes: nonEmpty(output.notes, "notes") }),
    });
  },

  async prepareBook(input, options) {
    const chunks = chunkText(input.text);
    if (!chunks.length) throw new Error("The book has no text to prepare");

    const sections = await callStructured({
      task: "book_map",
      model: options?.model ?? DEFAULT_MODELS.book_map,
      ...bookMapPrompt(input.title, chunks),
      schemaName: "book_map",
      schema: BookMapOutput,
      onCall: options?.onCall,
      check: (output) => {
        // Keep the sections whose start is a real chunk, in order, one per
        // start. The book always begins inside the first section.
        const starts = new Set<number>();
        const valid = output.sections
          .filter(
            (s) =>
              Number.isInteger(s.firstChunk) &&
              s.firstChunk >= 0 &&
              s.firstChunk < chunks.length &&
              s.title.trim(),
          )
          .sort((a, b) => a.firstChunk - b.firstChunk)
          .filter((s) => !starts.has(s.firstChunk) && starts.add(s.firstChunk));
        if (!valid.length) {
          throw new InvalidOutputError("no section starts at a valid chunk");
        }
        valid[0] = { ...valid[0], firstChunk: 0 };
        return valid;
      },
    });

    const bookSections: BookSection[] = sections.map((s, index) => ({
      index,
      chapter: s.chapter.trim(),
      title: s.title.trim(),
      summary: s.summary.trim(),
    }));
    // The section of each chunk: the last section starting at or before it.
    const sectionOfChunk = chunks.map((_, chunkIndex) =>
      sections.findLastIndex((s) => s.firstChunk <= chunkIndex),
    );
    // A chunk is embedded with its heading path in front, so a passage that
    // never names its topic ("take 4 from both pans") is still found by it.
    const vectors = await this.embed(
      chunks.map(
        (chunk, index) =>
          `${sectionLabel(bookSections[sectionOfChunk[index]])}\n\n${chunk}`,
      ),
      { onCall: options?.onCall },
    );
    return {
      sections: bookSections,
      chunks: chunks.map((content, index) => ({
        content,
        sectionIndex: sectionOfChunk[index],
        embedding: vectors[index],
      })),
    };
  },

  async embed(texts, options) {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      vectors.push(
        ...(await callEmbeddings(
          options?.model ?? EMBEDDING_MODEL,
          EMBEDDING_DIMENSIONS,
          texts.slice(i, i + EMBED_BATCH_SIZE),
          options?.onCall,
        )),
      );
    }
    return vectors;
  },
};
