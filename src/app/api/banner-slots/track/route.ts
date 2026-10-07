import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";
import {
  BANNER_BATCH_MAX,
  isBannerBatchType,
  isBannerEvent,
  isBannerSource,
} from "@/lib/banner-analytics";
import { isBannerPlacement } from "@/lib/banner-placements";

export const runtime = "nodejs";

type RecordedEvent =
  | { t: "imp"; source: string; id: string; s?: 1; r?: 1; slot?: 1 }
  | { t: "open" | "click"; source: string; id: string }
  | { t: "empty"; placement: string };

const flag = (value: unknown): boolean => value === 1 || value === true;

/** One event of the batch, normalised; null when it is malformed. */
function parseEvent(raw: unknown): RecordedEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as Record<string, unknown>;
  if (!isBannerBatchType(event.t)) return null;

  if (event.t === "empty") {
    return isBannerPlacement(event.placement)
      ? { t: "empty", placement: event.placement }
      : null;
  }

  const id = typeof event.id === "string" ? event.id : null;
  if (!id || !isUuid(id) || !isBannerSource(event.source)) return null;

  if (event.t === "imp") {
    return {
      t: "imp",
      source: event.source,
      id,
      ...(flag(event.s) ? { s: 1 as const } : {}),
      ...(flag(event.r) ? { r: 1 as const } : {}),
      ...(flag(event.slot) ? { slot: 1 as const } : {}),
    };
  }
  return { t: event.t, source: event.source, id };
}

/**
 * Impression / open / click beacon for every banner creative, paid ads and
 * editorial banners alike (contracts C46, C47).
 *
 * Anonymous by design — it is called from the public site via sendBeacon,
 * one batch per page flush: `{events: [...]}`, at most BANNER_BATCH_MAX. The
 * blast radius is bounded by the RPC, which only counts a creative that is
 * live right now and takes its placement from the creative's own row.
 * Malformed events are dropped one by one; the rest of the batch still counts.
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
    events?: unknown;
    source?: unknown;
    id?: unknown;
    event?: unknown;
  } | null;

  let events: RecordedEvent[];
  if (Array.isArray(body?.events)) {
    if (body.events.length === 0 || body.events.length > BANNER_BATCH_MAX) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    events = body.events
      .map(parseEvent)
      .filter((event): event is RecordedEvent => event !== null);
  } else {
    // Bundles from before C47 send one `{source, id, event}` at a time (and
    // those from before C46 no source). Their "view" was the first display of
    // a tab session: an impression with the session flag.
    const id = typeof body?.id === "string" ? body.id : null;
    const source = body?.source === undefined ? "ad" : body.source;
    const event = body?.event;
    if (
      !id ||
      !isUuid(id) ||
      !isBannerEvent(event) ||
      !isBannerSource(source)
    ) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    events = [
      event === "view"
        ? { t: "imp", source, id, s: 1, slot: 1 }
        : { t: event, source, id },
    ];
  }

  if (events.length === 0) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const db = createServiceClient();
  const { error } = await db.rpc("record_banner_events", {
    p_events: events,
  });

  if (error) {
    console.error("POST /api/banner-slots/track failed", error);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
  // 204: sendBeacon ignores the body anyway.
  return new Response(null, { status: 204 });
}
