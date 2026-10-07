import "server-only";
import { classifyDevice } from "@/lib/analytics/device";
import { lookupClientGeo } from "@/lib/analytics/geoip";
import {
  isUuidValue,
  parseSessionCookie,
  SESSION_COOKIE,
  VISITOR_COOKIE,
  type EventName,
  type SessionCookie,
} from "@/lib/analytics/model";
import { normalizePublicPageviewPath } from "@/lib/analytics/pageview";
import { getClientIp } from "@/lib/client-ip";
import {
  CONSENT_COOKIE_NAME,
  hasAnalyticsConsent,
  readCookieValue,
} from "@/lib/consent/cookies";
import { createServiceClient } from "@/lib/supabase/admin";

type RequestLike = { headers: { get(name: string): string | null } };

export type AnalyticsVisitor = {
  visitorId: string;
  session: SessionCookie | null;
};

/**
 * The analytics identity of a request, or null without analytics consent or
 * an mb_vid cookie: the same rule page views follow (C38). Reads the Cookie
 * header directly, so it also works inside `after()`.
 */
export function analyticsVisitor(req: RequestLike): AnalyticsVisitor | null {
  const cookie = req.headers.get("cookie");
  if (!hasAnalyticsConsent(readCookieValue(cookie, CONSENT_COOKIE_NAME))) {
    return null;
  }
  const visitorId = readCookieValue(cookie, VISITOR_COOKIE);
  if (!isUuidValue(visitorId)) return null;
  return {
    visitorId,
    session: parseSessionCookie(readCookieValue(cookie, SESSION_COOKIE)),
  };
}

export type AnalyticsEventInput = {
  name: EventName;
  entityType: "property" | "service" | "smart_match_request";
  entityId: string;
  /** The signed-in user the route already resolved (null = signed out). */
  userId: string | null;
};

/**
 * Records one visitor action for the admin analytics (C49). Source and device
 * come from the session cookie (the landing page view decided them), the page
 * from the Referer, the location from the request IP (looked up, never
 * stored). Analytics must never break the action itself: this never throws.
 */
export async function recordAnalyticsEvent(
  req: RequestLike,
  input: AnalyticsEventInput,
): Promise<void> {
  try {
    const visitor = analyticsVisitor(req);
    if (!visitor || !isUuidValue(input.entityId)) return;
    let path: string | null = null;
    const referer = req.headers.get("referer");
    if (referer) {
      try {
        path = normalizePublicPageviewPath(new URL(referer).pathname);
      } catch {
        path = null;
      }
    }
    const geo = await lookupClientGeo(getClientIp(req));
    const { error } = await createServiceClient()
      .from("analytics_events")
      .insert({
        name: input.name,
        entity_type: input.entityType,
        entity_id: input.entityId,
        visitor_id: visitor.visitorId,
        user_id: input.userId,
        session_id: visitor.session?.id ?? null,
        source: visitor.session?.source ?? null,
        device:
          visitor.session?.device ??
          classifyDevice(req.headers.get("user-agent")),
        country: geo.country,
        city: geo.city,
        path,
      });
    if (error) console.error("[analytics] event insert failed", error.code);
  } catch (error) {
    console.error(
      "[analytics] event not recorded",
      error instanceof Error ? error.message : error,
    );
  }
}
