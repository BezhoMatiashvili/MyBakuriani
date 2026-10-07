import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  DATA_BLOCKS,
  isOneOf,
  parseAnalyticsQuery,
} from "@/lib/analytics/model";
import { loadAnalyticsBlock } from "@/lib/analytics/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Admin analytics dashboard data (contract C49), one block per request:
 * ?block=traffic|listings|smartmatch|ads|live plus the dashboard query
 * (period, from/to, compare, gran, device, country, city, source, page), read
 * by the same parser as the page and the export. With compare=1 the answer
 * also holds the preceding period of the same length.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const params = req.nextUrl.searchParams;
  const block = params.get("block");
  if (!isOneOf(DATA_BLOCKS, block)) {
    return json({ error: "invalid_block" }, 400);
  }
  // Five blocks per change (two periods each when comparing) plus Live Now
  // every 15 s; the limiter fails open (C16).
  if (
    !(await checkRateLimit(
      `admin-analytics:${guard.admin.userId}`,
      240,
      60_000,
    ))
  ) {
    return json({ error: "rate_limited" }, 429);
  }

  const query = parseAnalyticsQuery(params);
  try {
    const payload = await loadAnalyticsBlock(
      createServiceClient(),
      block,
      query,
    );
    return json({ query, ...payload });
  } catch (error) {
    console.error(
      `GET /api/admin/analytics ${block} failed`,
      error instanceof Error ? error.message : error,
    );
    return json({ error: "server_error" }, 500);
  }
}
