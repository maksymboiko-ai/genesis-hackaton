import "server-only";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import type { LlmCallRecord } from "@/contracts/ai";
import type {
  BookRow,
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

type ChildDb = { id: string; name: string; grade_level: number; notes: string };
const CHILD_COLUMNS = "id, name, grade_level, notes";
const toChild = (r: ChildDb): ChildRow => ({ id: r.id, name: r.name, gradeLevel: r.grade_level, notes: r.notes });

type BookDb = { id: string; title: string; storage_path: string; status: BookRow["status"]; sections: unknown };
const BOOK_COLUMNS = "id, title, storage_path, status, sections";
const toBook = (r: BookDb): BookRow => ({
  id: r.id,
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
  content_status: LessonRow["contentStatus"];
  content: unknown;
  completed_at: string | null;
  last_score: number | null;
  book_section_index: number | null;
  generation_started_at: string | null;
  created_at: string;
};
const LESSON_COLUMNS =
  "id, curriculum_id, position, kind, title, objective, skills, retry_of_lesson_id, content_status, content, completed_at, last_score, book_section_index, generation_started_at, created_at";
const toLesson = (r: LessonDb): LessonRow => ({
  id: r.id,
  curriculumId: r.curriculum_id,
  position: r.position,
  kind: r.kind,
  title: r.title,
  objective: r.objective,
  skills: r.skills,
  retryOfLessonId: r.retry_of_lesson_id,
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

  async createChild(input: { name: string; gradeLevel: number }) {
    const { data, error } = await this.db
      .from("child")
      .insert({ name: input.name, grade_level: input.gradeLevel })
      .select(CHILD_COLUMNS)
      .single();
    check(error, "insert child");
    return toChild(data as ChildDb);
  }

  async listChildren() {
    const { data, error } = await this.db.from("child").select(CHILD_COLUMNS).order("created_at");
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
