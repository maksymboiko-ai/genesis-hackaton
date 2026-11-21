import { z } from "zod";
import { CreateCurriculumRequest, CreateCurriculumResponse, ListCurriculaResponse } from "@/contracts/api";
import { Id } from "@/contracts/domain";
import { createCurriculum, listCurricula } from "@/lib/server/curricula";
import { ok, parseJson, parseWith, queryOf, route } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

// The outline is generated before responding.
export const maxDuration = 60;

// POST /api/curricula
export const POST = route(
  async (req: Request) => {
    const body = await parseJson(req, CreateCurriculumRequest);
    const result = await createCurriculum(body);
    return ok(CreateCurriculumResponse, result, result.status === "created" ? 201 : 200);
  },
  { limit: LIMITS.curriculum },
);

const Query = z.object({ childId: Id });

// GET /api/curricula?childId=...
export const GET = route(
  async (req: Request) => {
    const { childId } = parseWith(Query, queryOf(req));
    return ok(ListCurriculaResponse, { curricula: await listCurricula(childId) });
  },
  { limit: LIMITS.read },
);
