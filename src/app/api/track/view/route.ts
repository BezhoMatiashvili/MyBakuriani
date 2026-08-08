import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { normalizePublicPageviewPath } from "@/lib/analytics/pageview";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

const VISITOR_COOKIE = "mb_vid";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function response(status: number, visitorId?: string) {
  const result = new NextResponse(null, { status });
  result.headers.set("Cache-Control", "no-store");
  if (visitorId) {
    result.cookies.set({
      name: VISITOR_COOKIE,
      value: visitorId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  }
  return result;
}

/** Records one first-party page view for an allow-listed public route. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    path?: unknown;
  } | null;
  const path = normalizePublicPageviewPath(
    typeof body?.path === "string" ? body.path : null,
  );
  if (!path) return response(400);

  const allowed = await checkRateLimit(
    `pageview:${getClientIp(req)}`,
    120,
    60_000,
  );
  if (!allowed) return response(429);

  const cookieStore = await cookies();
  const existingVisitorId = cookieStore.get(VISITOR_COOKIE)?.value;
  const visitorId =
    existingVisitorId && isUuid(existingVisitorId)
      ? existingVisitorId
      : crypto.randomUUID();

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Authentication is optional for this anonymous first-party metric.
  }

  const db = createServiceClient();
  const { error } = await db.from("page_views").insert({
    visitor_id: visitorId,
    user_id: userId,
    path,
  });
  if (error) {
    console.error("[pageview] insert failed", error.code);
    return response(503, visitorId);
  }

  // Reissue valid cookies too, upgrading legacy non-HttpOnly cookies and
  // refreshing the rolling one-year expiry without exposing the id to JS.
  return response(204, visitorId);
}
