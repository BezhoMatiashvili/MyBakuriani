import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

/**
 * Impression / click beacon for ad creatives.
 *
 * Anonymous by design — it is called from the public site via sendBeacon. The
 * blast radius is bounded by the RPC, which can only bump two integer columns
 * on an ad that is currently active and in-window.
 */
export async function POST(req: NextRequest) {
  // NOTE: checkRateLimit returns false when no shared limiter is configured in
  // production (fail-closed). That default is right for auth-adjacent routes,
  // but here it would silently pin every counter at zero — which is precisely
  // the bug this endpoint exists to fix. So the limit is enforced only when a
  // limiter actually exists, and its absence degrades to "unmetered counter"
  // rather than "no counter at all".
  const limiterConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
  if (limiterConfigured) {
    const ok = await checkRateLimit(
      `banner-track:${getClientIp(req)}`,
      120,
      60_000,
    );
    if (!ok) return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    event?: unknown;
  } | null;

  const id = typeof body?.id === "string" ? body.id : null;
  const event = body?.event;

  if (!id || !isUuid(id) || (event !== "view" && event !== "click")) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const db = createServiceClient();
  const { error } = await db.rpc("increment_ad_metric", {
    p_ad_id: id,
    p_event: event,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  // 204: sendBeacon ignores the body anyway.
  return new Response(null, { status: 204 });
}
