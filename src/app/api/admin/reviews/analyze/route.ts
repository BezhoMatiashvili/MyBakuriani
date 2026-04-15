import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { analyzeReview } from "@/lib/gemini";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id)
    return Response.json({ error: "id required" }, { status: 400 });

  const db = createServiceClient();
  const { data: review, error: fetchErr } = await db
    .from("reviews")
    .select("id, rating, comment")
    .eq("id", body.id)
    .single();
  if (fetchErr || !review) {
    return Response.json({ error: "review not found" }, { status: 404 });
  }
  if (!review.comment?.trim()) {
    return Response.json(
      { error: "review has no comment to analyze" },
      { status: 400 },
    );
  }

  try {
    const result = await analyzeReview({
      rating: Number(review.rating),
      comment: review.comment,
    });
    await db
      .from("reviews")
      .update({
        ai_sentiment: result.sentiment,
        ai_risk_tags: result.risk_tags,
        ai_analyzed_at: new Date().toISOString(),
      })
      .eq("id", review.id);
    return Response.json({ ok: true, analysis: result });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "analysis failed" },
      { status: 502 },
    );
  }
}
