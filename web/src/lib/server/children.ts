import "server-only";
import type { CreateChildRequest } from "@/contracts/api";
import { SkillSlug, type Child, type LearnerProfile } from "@/contracts/domain";
import { badRequest, notFound } from "./errors";
import { getStore } from "./store";
import type { ChildRow } from "./store/types";
import { cleanText } from "./text";

export const MAX_CHILD_NAME = 100;
// Notes are model-written and fed back into every prompt; keep them short.
export const MAX_NOTES = 2000;

const toChild = (row: ChildRow): Child => ({ id: row.id, name: row.name, gradeLevel: row.gradeLevel });

export async function createChild(input: CreateChildRequest): Promise<Child> {
  const name = cleanText(input.name, MAX_CHILD_NAME);
  if (!name) throw badRequest("Invalid fields: name.");
  return toChild(await getStore().createChild({ name, gradeLevel: input.gradeLevel }));
}

export async function listChildren(): Promise<Child[]> {
  return (await getStore().listChildren()).map(toChild);
}

export async function requireChild(childId: string): Promise<ChildRow> {
  const child = await getStore().getChild(childId);
  if (!child) throw notFound("Child");
  return child;
}

/**
 * What the app knows about a child, passed into every generation call.
 * Never includes the child's name: the model doesn't need it.
 */
export async function buildLearnerProfile(childId: string): Promise<LearnerProfile> {
  const child = await requireChild(childId);
  const mastery = await getStore().listMastery(childId);
  return {
    gradeLevel: child.gradeLevel,
    notes: cleanText(child.notes, MAX_NOTES),
    mastery: mastery
      .filter((m) => SkillSlug.safeParse(m.skill).success)
      .map((m) => ({ subject: m.subject, skill: m.skill, mastery: m.mastery })),
  };
}

/** Skill slugs the child already has, so the model reuses them. */
export function knownSkillsOf(profile: LearnerProfile): string[] {
  return [...new Set(profile.mastery.map((m) => m.skill))].sort();
}
