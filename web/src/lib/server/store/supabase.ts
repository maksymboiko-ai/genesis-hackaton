import "server-only";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import type { LlmCallRecord } from "@/contracts/ai";
import type {
  AttemptRow,
  BookRow,
  ChunkHit,
  ChildRow,
  CurriculumRow,
  LessonRow,
  MasteryRow,
  NewLesson,
  ReplanEventRow,
  Store,
} from "./types";

/** Throws a plain Error on a database error; the route wrapper hides it. */
function check(error: PostgrestError | null, what: string): void {
  if (error) throw new Error(`db ${what}: ${error.code} ${error.message}`);
}

type ChildDb = { id: string; owner_id: string | null; name: string; grade_level: number; notes: string };
const CHILD_COLUMNS = "id, owner_id, name, grade_level, notes";
const toChild = (r: ChildDb): ChildRow => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  gradeLevel: r.grade_level,
  notes: r.notes,
});

type BookDb = {
  id: string;
  owner_id: string | null;
  title: string;
  storage_path: string;
  status: BookRow["status"];
  sections: unknown;
};
const BOOK_COLUMNS = "id, owner_id, title, storage_path, status, sections";
const toBook = (r: BookDb): BookRow => ({
  id: r.id,
  ownerId: r.owner_id,
  title: r.title,
  storagePath: r.storage_path,
  status: r.status,
  sections: r.sections,
});

type CurriculumDb = {
  id: string;
  child_id: string;
  book_id: string | null;
  prompt: string;
  subject: string;
  title: string;
  replan_status: CurriculumRow["replanStatus"];
  last_replan_at: string | null;
  replan_started_at: string | null;
  created_at: string;
};
const CURRICULUM_COLUMNS =
  "id, child_id, book_id, prompt, subject, title, replan_status, last_replan_at, replan_started_at, created_at";
const toCurriculum = (r: CurriculumDb): CurriculumRow => ({
  id: r.id,
  childId: r.child_id,
  bookId: r.book_id,
  prompt: r.prompt,
  subject: r.subject,
  title: r.title,
  replanStatus: r.replan_status,
  lastReplanAt: r.last_replan_at,
  replanStartedAt: r.replan_started_at,
  createdAt: r.created_at,
});

type LessonDb = {
  id: string;
  curriculum_id: string;
  position: number;
  kind: LessonRow["kind"];
  title: string;
  objective: string;
  skills: string[];
  retry_of_lesson_id: string | null;
  reason: string | null;
  estimated_minutes: number;
  content_status: LessonRow["contentStatus"];
  content: unknown;
  completed_at: string | null;
  last_score: number | null;
  book_section_index: number | null;
  generation_started_at: string | null;
  created_at: string;
};
const LESSON_COLUMNS =
  "id, curriculum_id, position, kind, title, objective, skills, retry_of_lesson_id, reason, estimated_minutes, content_status, content, completed_at, last_score, book_section_index, generation_started_at, created_at";
const toLesson = (r: LessonDb): LessonRow => ({
  id: r.id,
  curriculumId: r.curriculum_id,
  position: r.position,
  kind: r.kind,
  title: r.title,
  objective: r.objective,
  skills: r.skills,
  retryOfLessonId: r.retry_of_lesson_id,
  reason: r.reason,
  estimatedMinutes: r.estimated_minutes,
  contentStatus: r.content_status,
  content: r.content,
  completedAt: r.completed_at,
  lastScore: r.last_score,
  bookSectionIndex: r.book_section_index,
  generationStartedAt: r.generation_started_at,
  createdAt: r.created_at,
});

type ReplanEventDb = {
  id: string;
  curriculum_id: string;
  trigger: ReplanEventRow["trigger"];
  diagnosis: unknown;
  inserted_lesson_ids: string[];
  created_at: string;
};
const toReplanEvent = (r: ReplanEventDb): ReplanEventRow => ({
  id: r.id,
  curriculumId: r.curriculum_id,
  trigger: r.trigger,
  diagnosis: r.diagnosis,
  insertedLessonIds: r.inserted_lesson_ids,
  createdAt: r.created_at,
});

/** jsonb shape the SQL functions read lessons from. */
export const lessonJson = (l: NewLesson) => ({
  kind: l.kind,
  title: l.title,
  objective: l.objective,
  skills: l.skills,
  retry_of_lesson_id: l.retryOfLessonId,
  book_section_index: l.bookSectionIndex,
  reason: l.reason,
  estimated_minutes: l.estimatedMinutes,
});

type AttemptDb = { id: string; lesson_id: string; score: number; results: unknown; created_at: string };
const ATTEMPT_COLUMNS = "id, lesson_id, score, results, created_at";
const toAttempt = (r: AttemptDb): AttemptRow => ({
  id: r.id,
  lessonId: r.lesson_id,
  score: r.score,
  results: r.results,
  createdAt: r.created_at,
});

export class SupabaseStore implements Store {
  readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string, readonly booksBucket: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async ping() {
    const { error } = await this.db.from("llm_call").select("id").limit(1);
    check(error, "ping");
  }

  async createChild(input: { ownerId: string; name: string; gradeLevel: number }) {
    const { data, error } = await this.db
      .from("child")
      .insert({ owner_id: input.ownerId, name: input.name, grade_level: input.gradeLevel })
      .select(CHILD_COLUMNS)
      .single();
    check(error, "insert child");
    return toChild(data as ChildDb);
  }

  async listChildren(ownerId: string) {
    const { data, error } = await this.db.from("child").select(CHILD_COLUMNS).eq("owner_id", ownerId).order("created_at");
    check(error, "list child");
    return (data as ChildDb[]).map(toChild);
  }

  async getChild(id: string) {
    const { data, error } = await this.db.from("child").select(CHILD_COLUMNS).eq("id", id).maybeSingle();
    check(error, "get child");
    return data ? toChild(data as ChildDb) : null;
  }

  async updateChildNotes(id: string, notes: string) {
    const { error } = await this.db.from("child").update({ notes }).eq("id", id);
    check(error, "update child notes");
  }

  async listMastery(childId: string): Promise<MasteryRow[]> {
    const { data, error } = await this.db
      .from("skill_mastery")
      .select("child_id, subject, skill, mastery")
      .eq("child_id", childId)
      .order("subject")
      .order("skill");
    check(error, "list skill_mastery");
    return (data as { child_id: string; subject: string; skill: string; mastery: number }[]).map((r) => ({
      childId: r.child_id,
      subject: r.subject,
      skill: r.skill,
      mastery: r.mastery,
    }));
  }

  async createBook(input: { ownerId: string; title: string; storagePath: string }) {
    const { data, error } = await this.db
      .from("book")
      .insert({ owner_id: input.ownerId, title: input.title, storage_path: input.storagePath })
      .select(BOOK_COLUMNS)
      .single();
    check(error, "insert book");
    return toBook(data as BookDb);
  }

  async listBooks(ownerId: string) {
    const { data, error } = await this.db
      .from("book")
      .select(BOOK_COLUMNS)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });
    check(error, "list book");
    return (data as BookDb[]).map(toBook);
  }

  async completeBook(
    id: string,
    sections: unknown,
    chunks: { chunkIndex: number; content: string; sectionIndex: number; embedding: number[] }[],
  ) {
    // Batches keep each request small; failBook() cleans up after a partial insert.
    for (let i = 0; i < chunks.length; i += 100) {
      const { error } = await this.db.from("book_chunk").insert(
        chunks.slice(i, i + 100).map((c) => ({
          book_id: id,
          chunk_index: c.chunkIndex,
          content: c.content,
          section_index: c.sectionIndex,
          embedding: c.embedding,
        })),
      );
      check(error, "insert book_chunk");
    }
    const { error } = await this.db.from("book").update({ sections, status: "ready" }).eq("id", id);
    check(error, "complete book");
  }

  async failBook(id: string) {
    const { error: e1 } = await this.db.from("book_chunk").delete().eq("book_id", id);
    check(e1, "delete book_chunk");
    const { error: e2 } = await this.db.from("book").update({ status: "failed" }).eq("id", id);
    check(e2, "fail book");
  }

  async uploadFile(path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await this.db.storage.from(this.booksBucket).upload(path, bytes, { contentType, upsert: false });
    if (error) throw new Error(`storage upload: ${error.message}`);
  }

  async createUploadUrl(path: string) {
    // Valid for 2 hours and for one file: without upsert a second PUT is refused.
    const { data, error } = await this.db.storage.from(this.booksBucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`storage sign upload: ${error?.message ?? "empty"}`);
    return data.signedUrl;
  }

  async fileSize(path: string) {
    const files = this.db.storage.from(this.booksBucket);
    // exists() is false only for a missing object and throws on anything else.
    const { data: found } = await files.exists(path);
    if (!found) return null;
    const { data, error } = await files.info(path);
    if (error || typeof data?.size !== "number") throw new Error(`storage info: ${error?.message ?? "no size"}`);
    return data.size;
  }

  async downloadFile(path: string) {
    const { data, error } = await this.db.storage.from(this.booksBucket).download(path);
    if (error || !data) throw new Error(`storage download: ${error?.message ?? "empty"}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  async removeFile(path: string) {
    const { error } = await this.db.storage.from(this.booksBucket).remove([path]);
    if (error) throw new Error(`storage remove: ${error.message}`);
  }

  async getBook(id: string) {
    const { data, error } = await this.db.from("book").select(BOOK_COLUMNS).eq("id", id).maybeSingle();
    check(error, "get book");
    return data ? toBook(data as BookDb) : null;
  }

  async createCurriculum(input: {
    childId: string;
    bookId: string | null;
    prompt: string;
    subject: string;
    title: string;
    lessons: NewLesson[];
  }) {
    const { data, error } = await this.db.rpc("create_curriculum", {
      p_child_id: input.childId,
      p_book_id: input.bookId,
      p_prompt: input.prompt,
      p_subject: input.subject,
      p_title: input.title,
      p_lessons: input.lessons.map(lessonJson),
    });
    check(error, "create_curriculum");
    return data as string;
  }

  async listCurricula(childId: string) {
    const { data, error } = await this.db
      .from("curriculum")
      .select(CURRICULUM_COLUMNS)
      .eq("child_id", childId)
      .order("created_at", { ascending: false });
    check(error, "list curriculum");
    return (data as CurriculumDb[]).map(toCurriculum);
  }

  async getCurriculum(id: string) {
    const { data, error } = await this.db.from("curriculum").select(CURRICULUM_COLUMNS).eq("id", id).maybeSingle();
    check(error, "get curriculum");
    return data ? toCurriculum(data as CurriculumDb) : null;
  }

  async listLessons(curriculumId: string) {
    const { data, error } = await this.db
      .from("lesson")
      .select(LESSON_COLUMNS)
      .eq("curriculum_id", curriculumId)
      .order("position")
      .order("created_at");
    check(error, "list lesson");
    return (data as LessonDb[]).map(toLesson);
  }

  async listReplanEvents(curriculumId: string) {
    const { data, error } = await this.db
      .from("replan_event")
      .select("id, curriculum_id, trigger, diagnosis, inserted_lesson_ids, created_at")
      .eq("curriculum_id", curriculumId)
      .order("created_at");
    check(error, "list replan_event");
    return (data as ReplanEventDb[]).map(toReplanEvent);
  }

  async getLesson(id: string) {
    const { data, error } = await this.db.from("lesson").select(LESSON_COLUMNS).eq("id", id).maybeSingle();
    check(error, "get lesson");
    return data ? toLesson(data as LessonDb) : null;
  }

  async claimLesson(id: string, staleBeforeIso: string, retryBeforeIso: string) {
    const { data, error } = await this.db.rpc("claim_lesson", {
      p_lesson_id: id,
      p_stale_before: staleBeforeIso,
      p_retry_before: retryBeforeIso,
    });
    check(error, "claim_lesson");
    return data === true;
  }

  async saveLessonContent(id: string, content: unknown, estimatedMinutes: number) {
    const { error } = await this.db
      .from("lesson")
      .update({ content, estimated_minutes: estimatedMinutes, content_status: "ready" })
      .eq("id", id)
      .eq("content_status", "generating");
    check(error, "save lesson content");
  }

  async failLesson(id: string) {
    const { error } = await this.db
      .from("lesson")
      .update({ content_status: "failed" })
      .eq("id", id)
      .eq("content_status", "generating");
    check(error, "fail lesson");
  }

  async recordAttempt(input: {
    lessonId: string;
    score: number;
    results: unknown;
    childId: string;
    subject: string;
    mastery: { skill: string; mastery: number }[];
  }) {
    const { data, error } = await this.db.rpc("record_attempt", {
      p_lesson_id: input.lessonId,
      p_score: input.score,
      p_results: input.results,
      p_child_id: input.childId,
      p_subject: input.subject,
      p_mastery: input.mastery,
    });
    check(error, "record_attempt");
    return data as string;
  }

  private async attemptsFor(lessonIds: string[], sinceIso: string | null, limit: number) {
    if (lessonIds.length === 0) return [];
    let query = this.db.from("attempt").select(ATTEMPT_COLUMNS).in("lesson_id", lessonIds);
    if (sinceIso) query = query.gt("created_at", sinceIso);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
    check(error, "list attempt");
    return (data as AttemptDb[]).map(toAttempt);
  }

  async listCurriculumAttempts(curriculumId: string, sinceIso: string | null, limit: number) {
    const { data, error } = await this.db.from("lesson").select("id").eq("curriculum_id", curriculumId);
    check(error, "list lesson ids");
    return this.attemptsFor((data as { id: string }[]).map((r) => r.id), sinceIso, limit);
  }

  async listChildAttempts(childId: string, limit: number) {
    // The latest few curricula keep the lesson id list (a URL filter) short.
    const { data: curricula, error: e1 } = await this.db
      .from("curriculum")
      .select("id")
      .eq("child_id", childId)
      .order("created_at", { ascending: false })
      .limit(5);
    check(e1, "list curriculum ids");
    const ids = (curricula as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return [];
    const { data: lessons, error: e2 } = await this.db.from("lesson").select("id").in("curriculum_id", ids);
    check(e2, "list lesson ids");
    return this.attemptsFor((lessons as { id: string }[]).map((r) => r.id), null, limit);
  }

  async claimReplan(curriculumId: string, staleBeforeIso: string) {
    const { data, error } = await this.db.rpc("claim_replan", {
      p_curriculum_id: curriculumId,
      p_stale_before: staleBeforeIso,
    });
    check(error, "claim_replan");
    return data === true;
  }

  async applyReplan(input: {
    curriculumId: string;
    insertAt: number;
    lessons: NewLesson[];
    trigger: "struggling" | "excelling";
    diagnosis: unknown;
  }) {
    const { data, error } = await this.db.rpc("apply_replan", {
      p_curriculum_id: input.curriculumId,
      p_insert_at: input.insertAt,
      p_lessons: input.lessons.map(lessonJson),
      p_trigger: input.trigger,
      p_diagnosis: input.diagnosis,
    });
    check(error, "apply_replan");
    return (data as string[] | null) ?? [];
  }

  async releaseReplan(curriculumId: string) {
    const { error } = await this.db
      .from("curriculum")
      .update({ replan_status: "idle", replan_started_at: null })
      .eq("id", curriculumId);
    check(error, "release replan");
  }

  async countChunks(bookId: string, sectionIndex: number) {
    const { count, error } = await this.db
      .from("book_chunk")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId)
      .eq("section_index", sectionIndex);
    check(error, "count book_chunk");
    return count ?? 0;
  }

  async listChunks(bookId: string, sectionIndex: number, limit: number): Promise<ChunkHit[]> {
    const { data, error } = await this.db
      .from("book_chunk")
      .select("chunk_index, content")
      .eq("book_id", bookId)
      .eq("section_index", sectionIndex)
      .order("chunk_index")
      .limit(limit);
    check(error, "list book_chunk");
    return (data as { chunk_index: number; content: string }[]).map((r) => ({ chunkIndex: r.chunk_index, content: r.content }));
  }

  async matchChunks(bookId: string, embedding: number[], limit: number, sectionIndex: number | null) {
    const { data, error } = await this.db.rpc("match_book_chunks", {
      p_book_id: bookId,
      p_embedding: embedding,
      p_limit: limit,
      p_section_index: sectionIndex,
    });
    check(error, "match_book_chunks");
    return (data as { chunk_index: number; content: string }[]).map((r) => ({ chunkIndex: r.chunk_index, content: r.content }));
  }

  async insertLlmCall(r: LlmCallRecord) {
    const { error } = await this.db.from("llm_call").insert({
      task: r.task,
      model: r.model,
      latency_ms: Math.round(r.latencyMs),
      input_tokens: r.inputTokens,
      output_tokens: r.outputTokens,
      ok: r.ok,
    });
    check(error, "insert llm_call");
  }

  async countLlmCallsSince(sinceIso: string) {
    const { count, error } = await this.db
      .from("llm_call")
      .select("id", { count: "exact", head: true })
      .gt("created_at", sinceIso);
    check(error, "count llm_call");
    return count ?? 0;
  }
}

export { check, toLesson, LESSON_COLUMNS, type LessonDb };
