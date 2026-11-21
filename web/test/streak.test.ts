import { describe, expect, it } from "vitest";
import { GET as getStreak } from "@/app/api/children/[childId]/streak/route";
import { POST as submit } from "@/app/api/lessons/[lessonId]/attempts/route";
import { GetStreakResponse } from "@/contracts/api";
import { localDay, timeZoneOf } from "@/lib/server/streak";
import { answers, call, jsonRequest, memory, readyCurriculum, signUpParent } from "./helpers";

const streakOf = (childId: string, headers: Record<string, string> = {}) =>
  call(getStreak, jsonRequest("GET", `/api/children/${childId}/streak`, undefined, headers), { childId });

const attemptIn = (lessonId: string, timeZone: string | null, correct = 3) =>
  call(
    submit,
    jsonRequest("POST", `/api/lessons/${lessonId}/attempts`, { answers: answers(lessonId, correct) }, timeZone ? { "x-timezone": timeZone } : {}),
    { lessonId },
  );

describe("local days", () => {
  it("counts the day in the child's time zone", () => {
    const at = new Date("2026-11-21T23:30:00Z");
    expect(localDay("UTC", at)).toBe("2026-11-21");
    expect(localDay("Europe/Kyiv", at)).toBe("2026-11-22");
    expect(localDay("America/Los_Angeles", at)).toBe("2026-11-21");
  });

  it("falls back to UTC for a missing or unknown zone", () => {
    const req = (zone?: string) => new Request("http://localhost/", zone ? { headers: { "x-timezone": zone } } : {});
    expect(timeZoneOf(req())).toBe("UTC");
    expect(timeZoneOf(req("Mars/Olympus"))).toBe("UTC");
    expect(timeZoneOf(req("'; drop table child; --"))).toBe("UTC");
    expect(timeZoneOf(req("Europe/Kyiv"))).toBe("Europe/Kyiv");
  });
});

describe("GET /api/children/:id/streak", () => {
  it("is empty before the first quiz", async () => {
    const { childId } = await readyCurriculum();
    const res = await streakOf(childId);
    expect(res.status).toBe(200);
    expect(GetStreakResponse.parse(res.body)).toEqual({ days: [] });
  });

  it("saves one day per quiz day, retakes included, in the sent time zone", async () => {
    const { childId, curriculum } = await readyCurriculum();
    const lessonId = curriculum.lessons[0].id;
    expect((await attemptIn(lessonId, "Europe/Kyiv")).status).toBe(201);
    expect((await attemptIn(lessonId, "Europe/Kyiv", 1)).status).toBe(201);
    const res = await streakOf(childId);
    expect(res.body.days).toEqual([localDay("Europe/Kyiv")]);
    expect(memory().data.activityDays.filter((d) => d.childId === childId)).toHaveLength(1);
  });

  it("lists days newest first and keeps them when a plan is gone", async () => {
    const { childId, curriculum } = await readyCurriculum();
    await memory().addActivityDay(childId, "2026-11-19");
    await memory().addActivityDay(childId, "2026-11-20");
    await attemptIn(curriculum.lessons[0].id, null);
    memory().data.curricula = memory().data.curricula.filter((c) => c.id !== curriculum.id);
    const res = await streakOf(childId);
    expect(res.body.days).toEqual([localDay("UTC"), "2026-11-20", "2026-11-19"]);
  });

  it("is not visible to another parent", async () => {
    const { childId } = await readyCurriculum();
    const other = await signUpParent("other-streak@example.com");
    expect((await streakOf(childId, { cookie: other.cookie })).status).toBe(404);
    expect((await streakOf(childId, { cookie: "" })).status).toBe(401);
  });
});

describe("streak from saved days (app)", async () => {
  const { streakOf: fromDays } = await import("@/lib/streak");
  const now = new Date(2026, 10, 21, 12); // Saturday

  it("counts a run ending today and shows the cheering pose", () => {
    const s = fromDays(["2026-11-21", "2026-11-20", "2026-11-19"], now);
    expect(s).toMatchObject({ count: 3, state: "done", doneToday: true, pose: "cheer" });
  });

  it("keeps the run pending until today's quiz", () => {
    const s = fromDays(["2026-11-20", "2026-11-19"], now);
    expect(s).toMatchObject({ count: 2, state: "pending", doneToday: false, pose: "keep-going" });
  });

  it("starts over with nothing saved", () => {
    expect(fromDays([], now)).toMatchObject({ count: 0, state: "none", pose: "peek" });
  });
});
