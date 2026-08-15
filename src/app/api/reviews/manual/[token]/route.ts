import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/i.test(token)) return Response.json({ error: "invalid_token" }, { status: 404, headers: noStoreHeaders });
  if (!(await checkRateLimit(`manual-review-read:${getClientIp(request)}`, 60, 60_000))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: noStoreHeaders });
  }
  const db = createServiceClient();
  const { data, error } = await db.rpc("manual_review_token_details", { p_token: token });
  if (error) return Response.json({ error: "server_error" }, { status: 500, headers: noStoreHeaders });
  if (!data) return Response.json({ error: "invalid_token" }, { status: 404, headers: noStoreHeaders });
  return Response.json({ review: data }, { headers: noStoreHeaders });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/i.test(token)) return Response.json({ error: "invalid_token" }, { status: 404, headers: noStoreHeaders });
  if (!(await checkRateLimit(`manual-review-write:${getClientIp(request)}`, 10, 60 * 60_000))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: noStoreHeaders });
  }
  const body = (await request.json().catch(() => null)) as { rating?: unknown; comment?: unknown } | null;
  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || (body?.comment != null && typeof body.comment !== "string")) {
    return Response.json({ error: "invalid_review" }, { status: 400, headers: noStoreHeaders });
  }
  const comment = typeof body?.comment === "string" ? body.comment.trim() : null;
  if (comment && Array.from(comment).length > 2000) return Response.json({ error: "comment_too_long" }, { status: 400, headers: noStoreHeaders });
  const db = createServiceClient();
  const { data, error } = await db.rpc("submit_manual_booking_review", { p_token: token, p_rating: rating, p_comment: comment });
  if (error) {
    const invalid = error.code === "22023" || error.code === "23505";
    return Response.json({ error: invalid ? "invalid_token" : "server_error" }, { status: invalid ? 409 : 500, headers: noStoreHeaders });
  }
  return Response.json({ id: data }, { status: 201, headers: noStoreHeaders });
}
