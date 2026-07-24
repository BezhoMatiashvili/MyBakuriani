import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { safeHttpsUrl } from "@/lib/security";
import { isCreativeMediaUrl } from "@/lib/banner-creative";
import {
  isBannerPlacement,
  legacyPositionForPlacement,
} from "@/lib/banner-placements";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const AD_STATUSES = ["active", "paused", "expired"];

/**
 * Ads were create-and-delete-only, so fixing a typo meant deleting the row and
 * losing its impression history. Field-by-field partial update, mirroring the
 * shape of the banners PATCH route.
 *
 * revalidatePath IS required: the landing page renders its placements
 * server-side from fetchSlotCreatives under `revalidate = 120`, so the
 * home_hero ad is baked into ISR HTML. Without this, pausing or editing a
 * home-page ad would take up to two minutes to take effect — the first thing
 * anyone testing the new pause button would hit. (Other surfaces read the
 * client route and are bounded by its own 60s s-maxage.)
 */
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

  const patch: Record<string, unknown> = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return Response.json({ error: "title required" }, { status: 400 });
    }
    patch.title = title;
  }

  if ("placement" in body) {
    if (!isBannerPlacement(body.placement)) {
      return Response.json({ error: "invalid placement" }, { status: 400 });
    }
    patch.placement = body.placement;
    patch.position = legacyPositionForPlacement(body.placement);
  }

  if ("url" in body) {
    const url = safeHttpsUrl(body.url);
    if (!url) {
      return Response.json(
        { error: "url must be a valid HTTPS URL" },
        { status: 400 },
      );
    }
    patch.url = url;
  }

  if ("banner_url" in body) {
    if (!isCreativeMediaUrl(body.banner_url)) {
      return Response.json(
        { error: "banner_url must be an uploaded image or video" },
        { status: 400 },
      );
    }
    patch.banner_url = safeHttpsUrl(body.banner_url);
  }

  if (typeof body.status === "string") {
    if (!AD_STATUSES.includes(body.status)) {
      return Response.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = body.status;
  }

  if (typeof body.start_at === "string") patch.start_at = body.start_at;
  if (typeof body.end_at === "string") patch.end_at = body.end_at;

  const start = patch.start_at ?? null;
  const end = patch.end_at ?? null;
  if (
    typeof start === "string" &&
    typeof end === "string" &&
    new Date(end) < new Date(start)
  ) {
    return Response.json(
      { error: "end_at cannot precede start_at" },
      { status: 400 },
    );
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }

  const db = createServiceClient(guard.admin.userId);
  const { data, error } = await db
    .from("ads")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  revalidatePath("/", "layout");
  return Response.json({ ad: data });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const db = createServiceClient(guard.admin.userId);
  const { error } = await db.from("ads").delete().eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  revalidatePath("/", "layout");
  return Response.json({ ok: true });
}
