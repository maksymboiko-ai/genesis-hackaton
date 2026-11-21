// End-to-end smoke test against a running server, through real HTTP and
// real after() background work:
//   STORE=memory AI_MODE=fake npx next start -p 3100
//   node scripts/smoke.mjs http://localhost:3100
// With a real database and model, point it at a dev deployment instead.
const base = process.argv[2] ?? "http://localhost:3000";
let failures = 0;

const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function poll(fn, done, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const value = await fn();
    if (done(value)) return value;
    await sleep(500);
  }
  return fn();
}

const child = await api("POST", "/api/children", { name: "Smoke", gradeLevel: 5 });
check(child.status === 201, "create child");

const vague = await api("POST", "/api/curricula", { childId: child.body.id, prompt: "math", bookId: null, clarifications: [] });
check(vague.status === 200 && vague.body.status === "needs_clarification", "vague prompt asks questions");

const created = await api("POST", "/api/curricula", {
  childId: child.body.id,
  prompt: "math",
  bookId: null,
  clarifications: vague.body.questions.map((question) => ({ question, answer: "fractions" })),
});
check(created.status === 201 && created.body.status === "created", "curriculum created after answers");
const curriculum = created.body.curriculum;

async function doLesson(lessonId, correct) {
  const lesson = await poll(() => api("GET", `/api/lessons/${lessonId}`), (r) => ["ready", "failed"].includes(r.body.contentStatus));
  check(lesson.body.contentStatus === "ready", `lesson ${lessonId.slice(0, 8)} ready (background generation)`);
  check(!JSON.stringify(lesson.body).includes("correctIndex"), "no answers in lesson response");
  const answers = lesson.body.content.questions.map((q, i) => ({ questionId: q.id, chosenIndex: i < correct ? 0 : 3 }));
  return api("POST", `/api/lessons/${lessonId}/attempts`, { answers });
}

// The fake puts the right answer at index n % 4 for question n, so
// "chosenIndex 0" is right only for the first question: scores stay low.
const ids = curriculum.lessons.map((l) => l.id);
await doLesson(ids[0], 0);
await doLesson(ids[1], 0);
const third = await doLesson(ids[2], 0);
check(third.status === 201 && third.body.replanTriggered === "struggling", "third poor attempt triggers a replan");

const after = await poll(() => api("GET", `/api/curricula/${curriculum.id}`), (r) => r.body.replanStatus === "idle");
check(after.body.replanStatus === "idle", "replan finished in the background");
check(after.body.lessons.some((l) => l.kind === "remedial") && after.body.lessons.some((l) => l.kind === "retry"), "remedial and retry lessons inserted");
check(after.body.replanEvents.length === 1, "replan event recorded");

const profile = await poll(() => api("GET", `/api/children/${child.body.id}/profile`), (r) => r.body.notes !== "");
check(profile.body.mastery.length > 0 && profile.body.notes !== "", "mastery and learner notes updated");

const bad = await api("POST", "/api/children", { name: "x", gradeLevel: 99 });
check(bad.status === 400 && bad.body.error.code === "bad_request", "validation error envelope");

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
