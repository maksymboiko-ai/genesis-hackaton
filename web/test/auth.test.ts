import { describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { GET as getBook } from "@/app/api/books/[bookId]/route";
import { GET as listBooks, POST as uploadBook } from "@/app/api/books/route";
import { GET as getProfile } from "@/app/api/children/[childId]/profile/route";
import { GET as listChildren, POST as createChild } from "@/app/api/children/route";
import { GET as getCurriculum } from "@/app/api/curricula/[curriculumId]/route";
import { GET as listCurricula, POST as createCurriculum } from "@/app/api/curricula/route";
import { GET as health } from "@/app/api/health/route";
import { POST as submit } from "@/app/api/lessons/[lessonId]/attempts/route";
import { POST as retry } from "@/app/api/lessons/[lessonId]/retry/route";
import { GET as getLesson } from "@/app/api/lessons/[lessonId]/route";
import { AuthResponse } from "@/contracts/api";
import { ACCESS_COOKIE, getAuth, REFRESH_COOKIE } from "@/lib/server/auth";
import type { MemoryAuth } from "@/lib/server/auth/memory";
import { call, jsonRequest, memory, parent, readyCurriculum, signUpParent } from "./helpers";

const anon = { cookie: "" };
const cookiesOf = (headers: Headers) => headers.getSetCookie();
const id = () => crypto.randomUUID();

describe("sign up, sign in, sign out", () => {
  it("sign up creates the account, signs in with httpOnly cookies scoped to /api", async () => {
    const res = await call(signup, jsonRequest("POST", "/api/auth/signup", { name: " Ann ", email: "Ann@Example.com ".trim(), password: "long enough pw" }, anon));
    expect(res.status).toBe(201);
    expect(AuthResponse.parse(res.body).user).toMatchObject({ email: "ann@example.com", name: "Ann" });
    const cookies = cookiesOf(res.headers);
    expect(cookies).toHaveLength(2);
    for (const c of cookies) {
      expect(c).toMatch(/HttpOnly/);
      expect(c).toMatch(/SameSite=Lax/);
      expect(c).toMatch(/Path=\/api/);
    }
    expect(JSON.stringify(res.body)).not.toMatch(/token|password/i);
  });

  it("refuses a taken email, a short password and a bad email", async () => {
    const body = { name: "A", email: "dup@example.com", password: "long enough pw" };
    expect((await call(signup, jsonRequest("POST", "/x", body, anon))).status).toBe(201);
    const again = await call(signup, jsonRequest("POST", "/x", { ...body, email: "DUP@example.com" }, anon));
    expect(again.status).toBe(409);
    expect((await call(signup, jsonRequest("POST", "/x", { ...body, email: "b@example.com", password: "short" }, anon))).status).toBe(400);
    expect((await call(signup, jsonRequest("POST", "/x", { ...body, email: "not-an-email" }, anon))).status).toBe(400);
  });

  it("login checks the password; me returns the parent", async () => {
    await call(signup, jsonRequest("POST", "/x", { name: "Bo", email: "bo@example.com", password: "right password" }, anon));
    const wrong = await call(login, jsonRequest("POST", "/x", { email: "bo@example.com", password: "wrong password" }, anon));
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("unauthorized");
    const unknown = await call(login, jsonRequest("POST", "/x", { email: "nobody@example.com", password: "right password" }, anon));
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);

    const ok = await call(login, jsonRequest("POST", "/x", { email: "BO@example.com", password: "right password" }, anon));
    expect(ok.status).toBe(200);
    const access = cookiesOf(ok.headers).find((c) => c.startsWith(`${ACCESS_COOKIE}=`))!.split(";")[0];
    const who = await call(me, jsonRequest("GET", "/api/auth/me", undefined, { cookie: access }));
    expect(who.body.user).toMatchObject({ email: "bo@example.com", name: "Bo" });
  });

  it("logout revokes the session at once and clears the cookies", async () => {
    expect((await call(me, jsonRequest("GET", "/x"))).status).toBe(200);
    const out = await call(logout, jsonRequest("POST", "/api/auth/logout"));
    expect(out.status).toBe(200);
    expect(cookiesOf(out.headers).every((c) => /Max-Age=0/.test(c))).toBe(true);
    expect((await call(me, jsonRequest("GET", "/x"))).status).toBe(401);
  });

  it("an expired access token is renewed with the refresh token", async () => {
    const p = await signUpParent("refresh@example.com");
    (getAuth() as MemoryAuth).expire(p.session.accessToken);
    const both = `${ACCESS_COOKIE}=${p.session.accessToken}; ${REFRESH_COOKIE}=${p.session.refreshToken}`;
    const res = await call(me, jsonRequest("GET", "/x", undefined, { cookie: both }));
    expect(res.status).toBe(200);
    const renewed = cookiesOf(res.headers);
    expect(renewed.some((c) => c.startsWith(`${ACCESS_COOKIE}=`))).toBe(true);
    // Refresh tokens are single use.
    const reused = await call(me, jsonRequest("GET", "/x", undefined, { cookie: `${REFRESH_COOKIE}=${p.session.refreshToken}` }));
    expect(reused.status).toBe(401);
  });

  it("login is rate-limited per IP", async () => {
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await call(login, jsonRequest("POST", "/x", { email: "x@example.com", password: "nope nope" }, { cookie: "", "x-forwarded-for": "7.7.7.7" }))).status);
    }
    expect(statuses).toContain(429);
  });
});

describe("every data route needs a session", () => {
  it("answers 401 unauthorized without one; health stays open", async () => {
    const routes: [unknown, string, string, unknown?, Record<string, string>?][] = [
      [listChildren, "GET", "/api/children"],
      [createChild, "POST", "/api/children", { name: "A", gradeLevel: 3 }],
      [getProfile, "GET", "/x", undefined, { childId: id() }],
      [listCurricula, "GET", `/api/curricula?childId=${id()}`],
      [createCurriculum, "POST", "/api/curricula", { childId: id(), prompt: "p", bookId: null, clarifications: [] }],
      [getCurriculum, "GET", "/x", undefined, { curriculumId: id() }],
      [getLesson, "GET", "/x", undefined, { lessonId: id() }],
      [retry, "POST", "/x", undefined, { lessonId: id() }],
      [submit, "POST", "/x", { answers: [{ questionId: "q", chosenIndex: 0 }] }, { lessonId: id() }],
      [listBooks, "GET", "/api/books"],
      [getBook, "GET", "/x", undefined, { bookId: id() }],
      [uploadBook, "POST", "/api/books", { title: "x" }],
      [me, "GET", "/api/auth/me"],
    ];
    for (const [handler, method, path, body, params] of routes) {
      const res = await call(handler, jsonRequest(method, path, body, anon), params ?? {});
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.body.error.code).toBe("unauthorized");
    }
    const forged = await call(listChildren, jsonRequest("GET", "/x", undefined, { cookie: `${ACCESS_COOKIE}=forged` }));
    expect(forged.status).toBe(401);
    expect((await call(health, jsonRequest("GET", "/api/health", undefined, anon))).status).toBe(200);
  });

  it("refuses cross-site POSTs", async () => {
    const res = await call(createChild, jsonRequest("POST", "/api/children", { name: "A", gradeLevel: 3 }, { origin: "https://evil.example", host: "localhost" }));
    expect(res.status).toBe(403);
    const same = await call(createChild, jsonRequest("POST", "/api/children", { name: "A", gradeLevel: 3 }, { origin: "http://localhost", host: "localhost" }));
    expect(same.status).toBe(201);
  });
});

describe("one parent never reaches another parent's data", () => {
  it("children, profiles, curricula, lessons, attempts and books are private", async () => {
    // Parent A (the default test parent) builds data.
    const { childId, curriculum } = await readyCurriculum();
    const lessonId = curriculum.lessons[0].id;
    const bookId = id();
    memory().data.books.push({ id: bookId, ownerId: parent.user.id, title: "A's book", storagePath: "books/a.pdf", status: "ready", sections: [] });

    // Parent B signs in.
    const b = await signUpParent("b@example.com", "B");
    const asB = { cookie: b.cookie };

    expect((await call(listChildren, jsonRequest("GET", "/x", undefined, asB))).body.children).toEqual([]);
    expect((await call(listBooks, jsonRequest("GET", "/x", undefined, asB))).body.books).toEqual([]);

    const denied: [unknown, string, unknown, Record<string, string>, string?][] = [
      [getProfile, "GET", undefined, { childId }],
      [getCurriculum, "GET", undefined, { curriculumId: curriculum.id }],
      [getLesson, "GET", undefined, { lessonId }],
      [retry, "POST", undefined, { lessonId }],
      [submit, "POST", { answers: [{ questionId: "q", chosenIndex: 0 }] }, { lessonId }],
      [getBook, "GET", undefined, { bookId }],
      [listCurricula, "GET", undefined, {}, `/api/curricula?childId=${childId}`],
      [createCurriculum, "POST", { childId, prompt: "fractions for grade five", bookId: null, clarifications: [] }, {}],
    ];
    for (const [handler, method, body, params, path] of denied) {
      const res = await call(handler, jsonRequest(method, path ?? "/x", body, asB), params);
      expect(res.status, JSON.stringify(params) + (path ?? "")).toBe(404);
    }

    // B's own child cannot use A's book.
    const bChild = await call(createChild, jsonRequest("POST", "/x", { name: "Bea", gradeLevel: 4 }, asB));
    const withBook = await call(
      createCurriculum,
      jsonRequest("POST", "/x", { childId: bChild.body.id, prompt: "fractions for grade five", bookId, clarifications: [] }, asB),
    );
    expect(withBook.status).toBe(404);

    // A still sees everything, and B's child is not in A's list.
    const aChildren = await call(listChildren, jsonRequest("GET", "/x"));
    expect(aChildren.body.children.map((c: { id: string }) => c.id)).toEqual([childId]);
  });
});
