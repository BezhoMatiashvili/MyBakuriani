import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";
import { isBannerEvent, isBannerSource } from "@/lib/banner-analytics";

export const runtime = "nodejs";

/**
 * View / open / click beacon for every banner creative, paid ads and editorial
 * banners alike (contract C46).
 *
 * Anonymous by design — it is called from the public site via sendBeacon. The
 * blast radius is bounded by the RPC, which only counts a creative that is live
 * right now and takes its placement from the creative's own row.
 */
export async function POST(req: NextRequest) {
  // This used to be wrapped in an "only if a limiter is configured" guard,
  // because checkRateLimit denied everything when Upstash was absent and would
  // have pinned every counter at zero — the exact bug this endpoint exists to
  // fix. The limiter is now Postgres-backed with a bounded local fallback, so
  // the guard is gone and the limit applies unconditionally.
  const ok = await checkRateLimit(
    `banner-track:${getClientIp(req)}`,
    120,
    60_000,
  );
  if (!ok) return Response.json({ error: "rate_limited" }, { status: 429 });

  const body = (await req.json().catch(() => null)) as {
    source?: unknown;
    id?: unknown;
    event?: unknown;
  } | null;

  const id = typeof body?.id === "string" ? body.id : null;
  const event = body?.event;
  // Bundles from before C46 tracked ads only and sent no source.
  const source = body?.source === undefined ? "ad" : body.source;

  if (!id || !isUuid(id) || !isBannerEvent(event) || !isBannerSource(source)) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const db = createServiceClient();
  const { error } = await db.rpc("record_banner_event", {
    p_source: source,
    p_id: id,
    p_event: event,
  });

  if (error) {
    console.error("POST /api/banner-slots/track failed", error);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
  // 204: sendBeacon ignores the body anyway.
  return new Response(null, { status: 204 });
}
