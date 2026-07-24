import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { isBannerKind, isBannerTone } from "@/lib/banners";
import { isTimeoutError } from "@/lib/with-timeout";
import { safeHttpsUrl, safeInternalPath } from "@/lib/security";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return Response.json({ error: "invalid body" }, { status: 400 });

  const update: Record<string, unknown> = {};

  if (typeof body.kind === "string") {
    if (!isBannerKind(body.kind)) {
      return Response.json({ error: "invalid kind" }, { status: 400 });
    }
    update.kind = body.kind;
  }
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) return Response.json({ error: "title required" }, { status: 400 });
    update.title = t;
  }
  if ("body" in body) {
    update.body =
      typeof body.body === "string" ? body.body.trim() || null : null;
  }
  if ("cta_label" in body) {
    update.cta_label =
      typeof body.cta_label === "string" ? body.cta_label.trim() || null : null;
  }
  if ("cta_href" in body) {
    const value = typeof body.cta_href === "string" ? body.cta_href.trim() : "";
    if (value && !(safeInternalPath(value) ?? safeHttpsUrl(value))) {
      return Response.json({ error: "invalid cta_href" }, { status: 400 });
    }
    update.cta_href = value ? safeInternalPath(value) ?? safeHttpsUrl(value) : null;
  }
  if ("image_url" in body) {
    const value = typeof body.image_url === "string" ? body.image_url.trim() : "";
    if (value && !safeHttpsUrl(value)) {
      return Response.json({ error: "invalid image_url" }, { status: 400 });
    }
    update.image_url = value ? safeHttpsUrl(value) : null;
  }
  if ("video_url" in body) {
    const value = typeof body.video_url === "string" ? body.video_url.trim() : "";
    if (value && !safeHttpsUrl(value)) {
      return Response.json({ error: "invalid video_url" }, { status: 400 });
    }
    update.video_url = value ? safeHttpsUrl(value) : null;
  }
  if ("video_poster_url" in body) {
    const value = typeof body.video_poster_url === "string"
      ? body.video_poster_url.trim()
      : "";
    if (value && !safeHttpsUrl(value)) {
      return Response.json({ error: "invalid video_poster_url" }, { status: 400 });
    }
    update.video_poster_url = value ? safeHttpsUrl(value) : null;
  }
  if (typeof body.tone === "string") {
    if (!isBannerTone(body.tone)) {
      return Response.json({ error: "invalid tone" }, { status: 400 });
    }
    update.tone = body.tone;
  }
  if (typeof body.active === "boolean") update.active = body.active;
  if ("start_at" in body) {
    update.start_at = typeof body.start_at === "string" ? body.start_at : null;
  }
  if ("end_at" in body) {
    update.end_at = typeof body.end_at === "string" ? body.end_at : null;
  }
  if (typeof body.sort_order === "number") update.sort_order = body.sort_order;

  if (
    typeof update.start_at === "string" &&
    typeof update.end_at === "string" &&
    new Date(update.end_at) < new Date(update.start_at)
  ) {
    return Response.json(
      { error: "end_at cannot precede start_at" },
      { status: 400 },
    );
  }

  const db = createServiceClient(guard.admin.userId);
  const { data, error } = await db
    .from("landing_banners")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json(
      {
        error: error.message,
        code: isTimeoutError(error) ? "timeout" : undefined,
      },
      { status: 500 },
    );
  }
  revalidatePath("/", "layout");
  return Response.json({ banner: data });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const db = createServiceClient(guard.admin.userId);
  const { error } = await db.from("landing_banners").delete().eq("id", id);

  if (error) {
    return Response.json(
      {
        error: error.message,
        code: isTimeoutError(error) ? "timeout" : undefined,
      },
      { status: 500 },
    );
  }
  revalidatePath("/", "layout");
  return Response.json({ ok: true });
}
