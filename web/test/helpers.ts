import { POST as createChild } from "@/app/api/children/route";
import { POST as createCurriculum } from "@/app/api/curricula/route";
import { POST as submit } from "@/app/api/lessons/[lessonId]/attempts/route";
import { LessonContent } from "@/contracts/domain";
import { flushBackground } from "@/lib/server/background";
import { getStore } from "@/lib/server/store";
import { MemoryStore } from "@/lib/server/store/memory";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export function jsonRequest(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

export async function call(handler: unknown, req: Request, params: Record<string, string> = {}) {
  const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = text ? JSON.parse(text) : null;
  return { status: res.status, body, headers: res.headers };
}

export function memory(): MemoryStore {
  return getStore() as MemoryStore;
}

export async function readyCurriculum() {
  const child = await call(createChild, jsonRequest("POST", "/api/children", { name: "Mia", gradeLevel: 5 }));
  const res = await call(
    createCurriculum,
    jsonRequest("POST", "/api/curricula", { childId: child.body.id, prompt: "fractions for fifth grade", bookId: null, clarifications: [] }),
  );
  await flushBackground();
  return { childId: child.body.id as string, curriculum: res.body.curriculum as { id: string; lessons: { id: string }[] } };
}

export function contentOf(lessonId: string) {
  return LessonContent.parse(memory().data.lessons.find((l) => l.id === lessonId)!.content);
}

/** Answers: right for the first `correct` questions, wrong for the rest. */
export function answers(lessonId: string, correct: number) {
  return contentOf(lessonId).questions.map((q, i) => ({
    questionId: q.id,
    chosenIndex: i < correct ? q.correctIndex : (q.correctIndex + 1) % 4,
  }));
}

export const attempt = (lessonId: string, body: unknown) =>
  call(submit, jsonRequest("POST", `/api/lessons/${lessonId}/attempts`, body), { lessonId });
