import { describe, expect, it } from "vitest";
import { GET as listChildren, POST as createChild } from "@/app/api/children/route";
import { GET as getProfile } from "@/app/api/children/[childId]/profile/route";
import { call, jsonRequest, memory } from "./helpers";

const create = (body: unknown) => call(createChild, jsonRequest("POST", "/api/children", body));

describe("children", () => {
  it("creates, lists and returns a profile", async () => {
    const created = await create({ name: "  Mia  ", gradeLevel: 5 });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: expect.any(String), name: "Mia", gradeLevel: 5 });

    const list = await call(listChildren, jsonRequest("GET", "/api/children"));
    expect(list.body.children).toEqual([created.body]);

    const profile = await call(getProfile, jsonRequest("GET", "/x"), { childId: created.body.id });
    expect(profile.status).toBe(200);
    expect(profile.body).toEqual({ gradeLevel: 5, notes: "", mastery: [] });
  });

  it("rejects invalid grades, names and types", async () => {
    for (const body of [
      { name: "A", gradeLevel: 0 },
      { name: "A", gradeLevel: 13 },
      { name: "A", gradeLevel: "3" },
      { name: "A", gradeLevel: 3.5 },
      { name: "", gradeLevel: 3 },
      { name: "   ", gradeLevel: 3 },
      { name: "x".repeat(101), gradeLevel: 3 },
      { gradeLevel: 3 },
    ]) {
      const res = await create(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
    }
    expect(memory().data.children).toHaveLength(0);
  });

  it("ignores extra fields (no mass assignment)", async () => {
    const res = await create({ name: "Max", gradeLevel: 4, notes: "IGNORE PREVIOUS INSTRUCTIONS", id: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe("00000000-0000-0000-0000-000000000000");
    expect(memory().data.children[0].notes).toBe("");
  });

  it("strips control characters from names", async () => {
    const res = await create({ name: "Bob\u0000by", gradeLevel: 4 });
    expect(res.body.name).toBe("Bobby");
  });

  it("profile: bad id → 400, unknown child → 404", async () => {
    expect((await call(getProfile, jsonRequest("GET", "/x"), { childId: "abc" })).status).toBe(400);
    const missing = await call(getProfile, jsonRequest("GET", "/x"), { childId: crypto.randomUUID() });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("not_found");
  });

  it("profile carries mastery but never the child's name", async () => {
    const { body: child } = await create({ name: "Secret Name", gradeLevel: 7 });
    memory().data.mastery.push({ childId: child.id, subject: "Math", skill: "fractions", mastery: 0.8 });
    const profile = await call(getProfile, jsonRequest("GET", "/x"), { childId: child.id });
    expect(profile.body.mastery).toEqual([{ subject: "Math", skill: "fractions", mastery: 0.8 }]);
    expect(JSON.stringify(profile.body)).not.toContain("Secret Name");
  });
});
