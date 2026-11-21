import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";
import { getStore } from "@/lib/server/store";

// GET /api/health: checks that the server can reach its store.
export const GET = publicRoute(
  async () => {
    await getStore().ping();
    return NextResponse.json({ ok: true });
  },
  { limit: LIMITS.read },
);
