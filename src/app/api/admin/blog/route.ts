import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u10A0-\u10FF\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const db = createServiceClient();
  const { data, error } = await db
    .from("blog_posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ posts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    content?: string;
    excerpt?: string;
    image_url?: string;
    publish?: boolean;
  } | null;
  if (!body?.title?.trim() || !body.content?.trim()) {
    return Response.json(
      { error: "title and content required" },
      { status: 400 },
    );
  }
  const slug = `${slugify(body.title)}-${Date.now().toString(36)}`;
  const db = createServiceClient();
  const { data, error } = await db
    .from("blog_posts")
    .insert({
      title: body.title.trim(),
      slug,
      content: body.content,
      excerpt: body.excerpt ?? null,
      image_url: body.image_url ?? null,
      author_id: guard.admin.userId,
      published: body.publish ?? false,
      published_at: body.publish ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ post: data });
}
