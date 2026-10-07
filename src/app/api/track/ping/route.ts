import { NextRequest, NextResponse } from "next/server";
import { analyticsVisitor } from "@/lib/analytics/events";
import {
  clampPingMs,
  formatSessionCookie,
  isUuidValue,
  SESSION_COOKIE,
  SESSION_IDLE_SECONDS,
} from "@/lib/analytics/model";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function done(status: number) {
  const result = new NextResponse(null, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}

/**
 * Engagement + Live Now beacon (C49). PageviewTracker sends the visible time
 * spent on a page (navigator.sendBeacon, so the body is text) when the page is
 * hidden or left, and a keepalive every 2 minutes while the visitor is active.
 * Only the visitor that owns the page view can extend it (analytics_ping).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text().catch(() => "");
  if (raw.length === 0 || raw.length > 256) return done(400);
  let body: { id?: unknown; ms?: unknown } | null = null;
  try {
    body = JSON.parse(raw) as { id?: unknown; ms?: unknown };
  } catch {
    return done(400);
  }
  if (!body || !isUuidValue(body.id)) return done(400);

  if (!(await checkRateLimit(`pageping:${getClientIp(req)}`, 120, 60_000))) {
    return done(429);
  }

  const visitor = analyticsVisitor(req);
  if (!visitor) return done(204);

  const { error } = await createServiceClient().rpc("analytics_ping", {
    p_id: body.id,
    p_visitor_id: visitor.visitorId,
    p_ms: clampPingMs(body.ms),
  });
  if (error) {
    console.error("[pageping] failed", error.code);
    return done(503);
  }

  const result = done(204);
  if (visitor.session) {
    // Activity keeps the session open (rolling 30 minutes, as a page view).
    result.cookies.set({
      name: SESSION_COOKIE,
      value: formatSessionCookie(visitor.session),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_IDLE_SECONDS,
    });
  }
  return result;
}
