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

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const db = createServiceClient();
  const { data, error } = await db
    .from("ads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ads: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    placement?: string;
    url?: string;
    banner_url?: string;
    start_at?: string;
    end_at?: string;
  } | null;

  if (
    !body?.title?.trim() ||
    !body.placement ||
    !body.url ||
    !body.start_at ||
    !body.end_at
  ) {
    return Response.json(
      { error: "title, placement, url, start_at, end_at required" },
      { status: 400 },
    );
  }
  if (!isBannerPlacement(body.placement)) {
    return Response.json({ error: "invalid placement" }, { status: 400 });
  }
  const adUrl = safeHttpsUrl(body.url);
  if (!adUrl) {
    return Response.json(
      { error: "url must be a valid HTTPS URL" },
      { status: 400 },
    );
  }
  // An ad with no creative cannot render, so the image is required — and it
  // must actually BE an image/video. The old form let a page URL land here
  // (broken thumbnails on 3 live rows); isCreativeMediaUrl closes that.
  if (!body.banner_url) {
    return Response.json({ error: "banner_url required" }, { status: 400 });
  }
  if (!isCreativeMediaUrl(body.banner_url)) {
    return Response.json(
      { error: "banner_url must be an uploaded image or video" },
      { status: 400 },
    );
  }
  if (new Date(body.end_at) < new Date(body.start_at)) {
    return Response.json(
      { error: "end_at cannot precede start_at" },
      { status: 400 },
    );
  }

  const db = createServiceClient(guard.admin.userId);
  const { data, error } = await db
    .from("ads")
    .insert({
      title: body.title,
      placement: body.placement,
      // `position` is the pre-placement column. Still NOT NULL, so keep it
      // populated and consistent — it is the revert path, nothing reads it.
      position: legacyPositionForPlacement(body.placement),
      url: adUrl,
      banner_url: safeHttpsUrl(body.banner_url),
      start_at: body.start_at,
      end_at: body.end_at,
      created_by: guard.admin.userId,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // The landing page bakes home placements into ISR HTML (revalidate = 120).
  revalidatePath("/", "layout");
  return Response.json({ ad: data });
}
