import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GenerateLessonInput } from "./fixtures";
import { GET as health } from "@/app/api/health/route";
import { LessonContent } from "@/contracts/domain";
import { EMBEDDING_DIMENSIONS, OutlineOutput } from "@/contracts/ai";
import { getAi } from "@/lib/server/ai";
import { fakeAi } from "@/lib/server/ai-fake";
import { getEnv, resetEnvForTests } from "@/lib/server/env";
import { badRequest } from "@/lib/server/errors";
import { MAX_JSON_BYTES, ok, parseJson, parseWith, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { cleanText, sanitizeMarkdown, toSkillSlug } from "@/lib/server/text";
import { call, jsonRequest, memory } from "./helpers";

describe("http helpers", () => {
  it("parseWith rejects a bad uuid and names the field, not the value", () => {
    expect(() => parseWith(z.object({ id: z.uuid() }), { id: "1 OR 1=1" })).toThrow(/Invalid fields: id\./);
    try {
      parseWith(z.object({ id: z.uuid() }), { id: "secret-value" });
    } catch (e) {
      expect(String((e as Error).message)).not.toContain("secret-value");
    }
  });

  it("parseJson enforces content type, size and syntax", async () => {
    const schema = z.object({ a: z.number() });
    await expect(parseJson(new Request("http://x", { method: "POST", body: "{}" }), schema)).rejects.toMatchObject({ status: 415 });
    const big = JSON.stringify({ a: 1, pad: "x".repeat(MAX_JSON_BYTES) });
    await expect(parseJson(jsonRequest("POST", "/", big), schema)).rejects.toMatchObject({ status: 413 });
    await expect(parseJson(jsonRequest("POST", "/", "{nope"), schema)).rejects.toMatchObject({ status: 400 });
    await expect(parseJson(jsonRequest("POST", "/", { a: 1, extra: true }), schema)).resolves.toEqual({ a: 1 });
  });

  it("route() maps HttpError to the envelope and hides unknown errors", async () => {
    const known = route(async () => {
      throw badRequest("Nope.");
    });
    const r1 = await call(known, jsonRequest("GET", "/api/x"));
    expect(r1.status).toBe(400);
    expect(r1.body).toEqual({ error: { code: "bad_request", message: "Nope." } });

    const original = console.error;
    console.error = () => {};
    const unknown = route(async () => {
      throw new Error("db: relation child does not exist, key=abc");
    });
    const r2 = await call(unknown, jsonRequest("GET", "/api/x"));
    console.error = original;
    expect(r2.status).toBe(500);
    expect(r2.body.error.code).toBe("internal");
    expect(r2.body.error.message).not.toMatch(/relation|key=/);
  });

  it("ok() strips fields that are not in the response schema", async () => {
    const res = ok(z.object({ id: z.string() }), { id: "a", correctIndex: 2 } as never);
    expect(await res.json()).toEqual({ id: "a" });
  });

  it("route() applies the rate limit per client IP", async () => {
    const h = route(async () => ok(z.object({}), {}), { limit: { name: "t", capacity: 2, perMinute: 1 } });
    const req = () => jsonRequest("GET", "/", undefined, { "x-forwarded-for": "1.2.3.4" });
    expect((await call(h, req())).status).toBe(200);
    expect((await call(h, req())).status).toBe(200);
    expect((await call(h, req())).status).toBe(429);
    const other = jsonRequest("GET", "/", undefined, { "x-forwarded-for": "5.6.7.8" });
    expect((await call(h, other)).status).toBe(200);
  });

  it("rate limit refills over time", () => {
    const rule = { name: "r", capacity: 1, perMinute: 60 };
    rateLimit("k", rule, 0);
    expect(() => rateLimit("k", rule, 10)).toThrow();
    expect(() => rateLimit("k", rule, 2_000)).not.toThrow();
  });
});

describe("text helpers", () => {
  it("cleanText strips control characters and caps length", () => {
    expect(cleanText("  a\u0000b\u0007c  ", 10)).toBe("abc");
    expect(cleanText("abcdef", 3)).toBe("abc");
  });

  it("sanitizeMarkdown removes active HTML and script links", () => {
    const md = 'Hi <script>alert(1)</script><img src=x onerror="alert(2)"> [x](javascript:alert(3)) [ok](https://a.b)';
    const out = sanitizeMarkdown(md, 1000);
    expect(out).not.toMatch(/script|onerror|javascript:/i);
    expect(out).toContain("[ok](https://a.b)");
  });

  it("toSkillSlug normalizes or rejects", () => {
    expect(toSkillSlug(" Solving Linear Equations! ")).toBe("solving-linear-equations");
    expect(toSkillSlug("***")).toBeNull();
  });
});

describe("env", () => {
  it("requires Supabase settings when STORE=supabase, without printing values", () => {
    const saved = { ...process.env };
    process.env.STORE = "supabase";
    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "very-secret-key-value-123";
    resetEnvForTests();
    expect(() => getEnv()).toThrow(/SUPABASE_URL/);
    try {
      getEnv();
    } catch (e) {
      expect(String(e)).not.toContain("very-secret");
    }
    process.env = saved;
    resetEnvForTests();
  });
});

describe("AI layer", () => {
  it("fake outputs satisfy the contracts", async () => {
    const outline = await fakeAi.generateOutline({
      prompt: "fractions for a 5th grader",
      clarifications: [],
      learner: { gradeLevel: 5, notes: "", mastery: [] },
      knownSkills: [],
      bookSections: [],
    });
    expect(outline.kind).toBe("outline");
    if (outline.kind === "outline") OutlineOutput.parse(outline.outline);
    LessonContent.parse(await fakeAi.generateLesson(GenerateLessonInput));
    const [v] = await fakeAi.embed(["hello world"]);
    expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("getAi() logs every call to llm_call", async () => {
    await getAi().embed(["a"]);
    await new Promise((r) => setTimeout(r, 0));
    expect(memory().data.llmCalls).toHaveLength(1);
    expect(memory().data.llmCalls[0]).toMatchObject({ task: "embed", ok: true });
  });

  it("getAi() refuses calls over the daily budget", async () => {
    process.env.DAILY_LLM_CALL_LIMIT = "1";
    resetEnvForTests();
    await getAi().embed(["a"]);
    await new Promise((r) => setTimeout(r, 0));
    await expect(getAi().embed(["b"])).rejects.toMatchObject({ status: 429 });
    delete process.env.DAILY_LLM_CALL_LIMIT;
  });

  it("getAi() turns AI failures into a safe 502", async () => {
    const original = console.error;
    console.error = () => {};
    const spy = fakeAi.embed;
    fakeAi.embed = async () => {
      throw new Error("openrouter: 401 invalid key sk-xyz");
    };
    await expect(getAi().embed(["a"])).rejects.toMatchObject({ status: 502, message: expect.not.stringContaining("sk-") });
    fakeAi.embed = spy;
    console.error = original;
  });
});

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await call(health, jsonRequest("GET", "/api/health"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("AI_MODE=real", () => {
  it("routes without model calls work without a key; model calls fail safely", async () => {
    process.env.AI_MODE = "real";
    delete process.env.OPENROUTER_API_KEY;
    resetEnvForTests();
    const original = console.error;
    console.error = () => {};
    try {
      expect((await call(health, jsonRequest("GET", "/api/health"))).status).toBe(200);
      await expect(getAi().embed(["a"])).rejects.toMatchObject({ status: 502 });
    } finally {
      console.error = original;
      process.env.AI_MODE = "fake";
      resetEnvForTests();
    }
  });
});

describe("AI wrapper keeps `this`", () => {
  it("calls methods on the service object (lib/ai prepareBook uses this.embed)", async () => {
    const original = fakeAi.prepareBook;
    fakeAi.prepareBook = async function (this: typeof fakeAi) {
      const [v] = await this.embed(["x"]);
      return { sections: [{ index: 0, chapter: "", title: "A", summary: "" }], chunks: [{ content: "x", sectionIndex: 0, embedding: v }] };
    };
    try {
      const out = await getAi().prepareBook({ title: "t", text: "x" });
      expect(out.chunks[0].embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    } finally {
      fakeAi.prepareBook = original;
    }
  });
});
