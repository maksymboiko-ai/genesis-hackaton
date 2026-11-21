import { AdminAnalyticsResponse } from "@/contracts/api";
import { getAdminAnalytics } from "@/lib/server/analytics";
import { adminRoute, ok } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/rate-limit";

// GET /api/admin/analytics: product-wide numbers, for ADMIN_EMAILS only.
export const GET = adminRoute(async () => ok(AdminAnalyticsResponse, await getAdminAnalytics()), {
  limit: LIMITS.admin,
});
