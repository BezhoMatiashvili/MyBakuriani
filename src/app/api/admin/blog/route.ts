import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { blogSlug } from "@/lib/blog-slug";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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
    video_url?: string;
    video_poster_url?: string;
    publish?: boolean;
  } | null;
  if (!body?.title?.trim() || !body.content?.trim()) {
    return Response.json(
      { error: "title and content required" },
      { status: 400 },
    );
  }
  // Set once: PATCH never rewrites it, so a shared link stays the post's URL
  // (C40). The time token also resolves the post if its words ever change.
  const slug = blogSlug(body.title, Date.now().toString(36));
  const db = createServiceClient(guard.admin.userId);
  const { data, error } = await db
    .from("blog_posts")
    .insert({
      title: body.title.trim(),
      slug,
      content: body.content,
      excerpt: body.excerpt ?? null,
      image_url: body.image_url ?? null,
      video_url: body.video_url ?? null,
      video_poster_url: body.video_poster_url ?? null,
      author_id: guard.admin.userId,
      published: body.publish ?? false,
      published_at: body.publish ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // The home page's blog rail and /blog read this table (ISR): show the new
  // post on the next request instead of after the revalidate window.
  revalidatePath("/", "layout");
  return Response.json({ post: data });
}
