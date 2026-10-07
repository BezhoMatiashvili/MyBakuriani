import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { analyticsVisitor, recordAnalyticsEvent } from "@/lib/analytics/events";
import { CLIENT_EVENTS, isOneOf, isUuidValue } from "@/lib/analytics/model";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function done(status: number) {
  const result = new NextResponse(null, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}

/**
 * Visitor actions the browser performs straight against Supabase (C49): a
 * saved listing and a Smart Match request. The action must already exist and
 * belong to the signed-in user, so a forged call cannot invent one. Calls,
 * messages, listing views and job applications are recorded by the routes
 * that perform them, never through here.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    entityId?: unknown;
  } | null;
  if (
    !body ||
    !isOneOf(CLIENT_EVENTS, body.name) ||
    !isUuidValue(body.entityId)
  ) {
    return done(400);
  }
  const name = body.name;
  const entityId = body.entityId;

  if (!(await checkRateLimit(`track-event:${getClientIp(req)}`, 60, 60_000))) {
    return done(429);
  }
  // No consent: nothing to record, and no reason to look anything up.
  if (!analyticsVisitor(req)) return done(204);

  const user = await getCurrentUser().catch(() => null);
  if (!user) return done(204);

  const db = createServiceClient();
  let entityType: "property" | "service" | "smart_match_request";
  if (name === "save") {
    const { data } = await db
      .from("favorites")
      .select("property_id, service_id")
      .eq("user_id", user.id)
      .or(`property_id.eq.${entityId},service_id.eq.${entityId}`)
      .maybeSingle();
    if (!data) return done(204);
    entityType = data.property_id ? "property" : "service";
  } else {
    const { data } = await db
      .from("smart_match_requests")
      .select("id")
      .eq("id", entityId)
      .eq("guest_id", user.id)
      .maybeSingle();
    if (!data) return done(204);
    entityType = "smart_match_request";
  }

  await recordAnalyticsEvent(req, {
    name,
    entityType,
    entityId,
    userId: user.id,
  });
  return done(204);
}
