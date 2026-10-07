import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current-user";
import { classifyDevice } from "@/lib/analytics/device";
import { lookupClientGeo } from "@/lib/analytics/geoip";
import {
  cleanUtm,
  continuesSession,
  formatSessionCookie,
  parseSessionCookie,
  SESSION_COOKIE,
  SESSION_IDLE_SECONDS,
  VISITOR_COOKIE,
  type SessionCookie,
} from "@/lib/analytics/model";
import { normalizePublicPageviewPath } from "@/lib/analytics/pageview";
import {
  classifySource,
  hasExternalSignal,
  isOwnHost,
  normalizeHost,
  type SourceSignals,
} from "@/lib/analytics/traffic-source";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/uuid";
import {
  CONSENT_COOKIE_NAME,
  hasAnalyticsConsent,
} from "@/lib/consent/cookies";

export const runtime = "nodejs";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type ViewBody = {
  path?: unknown;
  /** document.referrer, sent on the first page view of a document only. */
  ref?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  gclid?: unknown;
  fbclid?: unknown;
  /** navigator.maxTouchPoints (tells an iPad from a Mac). */
  tp?: unknown;
};

function withCookies(
  result: NextResponse,
  visitorId?: string,
  session?: SessionCookie,
): NextResponse {
  result.headers.set("Cache-Control", "no-store");
  const secure = process.env.NODE_ENV === "production";
  if (visitorId) {
    result.cookies.set({
      name: VISITOR_COOKIE,
      value: visitorId,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  }
  if (session) {
    // Rolling: a session ends after 30 minutes without a hit (C49).
    result.cookies.set({
      name: SESSION_COOKIE,
      value: formatSessionCookie(session),
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: SESSION_IDLE_SECONDS,
    });
  }
  return result;
}

function empty(status: number) {
  return withCookies(new NextResponse(null, { status }));
}

/**
 * Records one first-party page view for an allow-listed public route, with
 * the analytics session (mb_sid), its traffic source, the device class and the
 * visitor's country/city (C49). Only derived categories are stored: never the
 * User-Agent, the referrer URL or the IP.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as ViewBody | null;
  const path = normalizePublicPageviewPath(
    typeof body?.path === "string" ? body.path : null,
  );
  if (!body || !path) return empty(400);

  const ip = getClientIp(req);
  const allowed = await checkRateLimit(`pageview:${ip}`, 120, 60_000);
  if (!allowed) return empty(429);

  const cookieStore = await cookies();

  // Analytics consent is enforced here as well as in PageviewTracker, because
  // the client check is bypassable and this is the call that would otherwise
  // MINT the mb_vid cookie. Declining must mean no identifier is issued and no
  // row is written - not merely that the UI stops asking. 204 keeps the beacon
  // silent; it is fire-and-forget either way.
  if (!hasAnalyticsConsent(cookieStore.get(CONSENT_COOKIE_NAME)?.value)) {
    return empty(204);
  }

  const existingVisitorId = cookieStore.get(VISITOR_COOKIE)?.value;
  const visitorId =
    existingVisitorId && isUuid(existingVisitorId)
      ? existingVisitorId
      : crypto.randomUUID();

  let userId: string | null = null;
  try {
    const user = await getCurrentUser();
    userId = user?.id ?? null;
  } catch {
    // Authentication is optional for this anonymous first-party metric.
  }

  const userAgent = req.headers.get("user-agent");
  const referrerHost = normalizeHost(body.ref);
  const signals: SourceSignals = {
    referrerHost,
    utmSource: cleanUtm(body.utm_source),
    gclid: body.gclid === true,
    fbclid: body.fbclid === true,
    userAgent,
  };
  const hitSource = classifySource(signals);
  const external = hasExternalSignal(signals);
  const device = classifyDevice(
    userAgent,
    typeof body.tp === "number" ? body.tp : null,
  );
  const current = parseSessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
  const session: SessionCookie =
    current && continuesSession(current, external, hitSource)
      ? current
      : { id: crypto.randomUUID(), source: hitSource, device };
  const geo = await lookupClientGeo(ip);

  const db = createServiceClient();
  const { data, error } = await db
    .from("page_views")
    .insert({
      visitor_id: visitorId,
      user_id: userId,
      path,
      session_id: session.id,
      source: session.source,
      referrer_host:
        referrerHost && !isOwnHost(referrerHost) ? referrerHost : null,
      utm_source: cleanUtm(body.utm_source),
      utm_medium: cleanUtm(body.utm_medium),
      utm_campaign: cleanUtm(body.utm_campaign),
      device,
      country: geo.country,
      city: geo.city,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[pageview] insert failed", error?.code);
    return withCookies(new NextResponse(null, { status: 503 }), visitorId);
  }

  // Reissue valid cookies too, upgrading legacy non-HttpOnly cookies and
  // refreshing the rolling expiries without exposing the ids to JS. The row id
  // lets the tracker report the visible time spent on this page (ping).
  return withCookies(
    NextResponse.json({ id: data.id }, { status: 200 }),
    visitorId,
    session,
  );
}
