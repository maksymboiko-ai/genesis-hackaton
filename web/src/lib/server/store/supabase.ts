import "server-only";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import type { LlmCallRecord } from "@/contracts/ai";
import type { ChildRow, MasteryRow, Store } from "./types";

/** Throws a plain Error on a database error; the route wrapper hides it. */
function check(error: PostgrestError | null, what: string): void {
  if (error) throw new Error(`db ${what}: ${error.code} ${error.message}`);
}

type ChildDb = { id: string; name: string; grade_level: number; notes: string };
const CHILD_COLUMNS = "id, name, grade_level, notes";
const toChild = (r: ChildDb): ChildRow => ({ id: r.id, name: r.name, gradeLevel: r.grade_level, notes: r.notes });

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

export { check };
