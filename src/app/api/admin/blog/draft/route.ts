import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { draftBlogArticle } from "@/lib/gemini";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as {
    topic?: string;
    keywords?: string[];
  } | null;
  if (!body?.topic?.trim()) {
    return Response.json({ error: "topic required" }, { status: 400 });
  }
  try {
    const draft = await draftBlogArticle({
      topic: body.topic,
      keywords: body.keywords ?? [],
    });
    return Response.json(draft);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "draft failed" },
      { status: 502 },
    );
  }
}
