import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { isBannerKind, isBannerTone } from "@/lib/banners";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const db = createServiceClient();
  const { data, error } = await db
    .from("landing_banners")
    .select("*")
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ banners: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    kind?: string;
    title?: string;
    body?: string | null;
    cta_label?: string | null;
    cta_href?: string | null;
    image_url?: string | null;
    video_url?: string | null;
    video_poster_url?: string | null;
    tone?: string;
    active?: boolean;
    start_at?: string | null;
    end_at?: string | null;
    sort_order?: number;
  } | null;

  if (!body?.kind || !isBannerKind(body.kind)) {
    return Response.json({ error: "invalid kind" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return Response.json({ error: "title required" }, { status: 400 });
  }
  const tone = body.tone && isBannerTone(body.tone) ? body.tone : "orange";

  if (
    body.start_at &&
    body.end_at &&
    new Date(body.end_at) < new Date(body.start_at)
  ) {
    return Response.json(
      { error: "end_at cannot precede start_at" },
      { status: 400 },
    );
  }

  const db = createServiceClient(guard.admin.userId);
  const { data, error } = await db
    .from("landing_banners")
    .insert({
      kind: body.kind,
      title: body.title.trim(),
      body: body.body?.trim() || null,
      cta_label: body.cta_label?.trim() || null,
      cta_href: body.cta_href?.trim() || null,
      image_url: body.image_url?.trim() || null,
      video_url: body.video_url?.trim() || null,
      video_poster_url: body.video_poster_url?.trim() || null,
      tone,
      active: body.active ?? true,
      start_at: body.start_at || null,
      end_at: body.end_at || null,
      sort_order: body.sort_order ?? 0,
      created_by: guard.admin.userId,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  revalidatePath("/", "layout");
  return Response.json({ banner: data });
}
