import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { safeHttpsUrl } from "@/lib/security";
import { parseStorageObjectUrl } from "@/lib/utils/photos";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const MEDIA_COLUMNS = ["image_url", "video_url", "video_poster_url"] as const;
type MediaRow = Record<(typeof MEDIA_COLUMNS)[number], string | null>;

// Best-effort removal of a post's own uploads (`landing-media/blog/…`, what
// MediaUploader kind="blog" writes) once the row no longer points at them.
// The admin form keeps the saved files while an edit is open (it can be
// cancelled), so the old object is deleted here, after the write succeeded.
async function removeBlogMedia(
  db: ReturnType<typeof createServiceClient>,
  urls: (string | null)[],
) {
  const paths: string[] = [];
  for (const url of urls) {
    if (!url) continue;
    const parsed = parseStorageObjectUrl(url);
    if (
      parsed?.sameOrigin &&
      parsed.bucket === "landing-media" &&
      parsed.path.startsWith("blog/")
    ) {
      paths.push(parsed.path);
    }
  }
  if (paths.length === 0) return;
  const { error } = await db.storage.from("landing-media").remove(paths);
  if (error) console.warn("blog media cleanup failed", error.message);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as {
    title?: unknown;
    content?: unknown;
    excerpt?: unknown;
    image_url?: unknown;
    video_url?: unknown;
    video_poster_url?: unknown;
    publish?: unknown;
  } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content : "";
  if (!title || !content.trim()) {
    return Response.json(
      { error: "title and content required" },
      { status: 400 },
    );
  }

  const media = {} as MediaRow;
  for (const column of MEDIA_COLUMNS) {
    const raw = body?.[column];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value && !safeHttpsUrl(value)) {
      return Response.json({ error: `invalid ${column}` }, { status: 400 });
    }
    media[column] = value ? safeHttpsUrl(value) : null;
  }

  const db = createServiceClient(guard.admin.userId);
  const { data: current, error: readError } = await db
    .from("blog_posts")
    .select("published_at, image_url, video_url, video_poster_url")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    return Response.json({ error: readError.message }, { status: 500 });
  }
  if (!current) return Response.json({ error: "not found" }, { status: 404 });

  const publish = body?.publish === true;
  // The slug stays: it is the post's canonical URL (C40). `published_at` is
  // set once, on the first publish, so an edit neither reorders the blog nor
  // moves the sitemap's lastmod.
  const { data, error } = await db
    .from("blog_posts")
    .update({
      title,
      content,
      excerpt:
        typeof body?.excerpt === "string" ? body.excerpt.trim() || null : null,
      ...media,
      published: publish,
      published_at:
        publish && !current.published_at
          ? new Date().toISOString()
          : current.published_at,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const kept = new Set(MEDIA_COLUMNS.map((c) => media[c]));
  await removeBlogMedia(
    db,
    MEDIA_COLUMNS.map((c) => current[c]).filter((url) => !kept.has(url)),
  );

  revalidatePath("/", "layout");
  return Response.json({ post: data });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!isUuid(id))
    return Response.json({ error: "invalid id" }, { status: 400 });

  const db = createServiceClient(guard.admin.userId);
  const { data, error } = await db
    .from("blog_posts")
    .delete()
    .eq("id", id)
    .select("image_url, video_url, video_poster_url")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "not found" }, { status: 404 });

  await removeBlogMedia(db, [
    data.image_url,
    data.video_url,
    data.video_poster_url,
  ]);

  revalidatePath("/", "layout");
  return Response.json({ ok: true });
}
