import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { safeHttpsUrl } from "@/lib/security";

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
    position?: string;
    url?: string;
    banner_url?: string;
    start_at?: string;
    end_at?: string;
  } | null;
  if (
    !body?.title?.trim() ||
    !body.position ||
    !body.url ||
    !body.start_at ||
    !body.end_at
  ) {
    return Response.json(
      { error: "title, position, url, start_at, end_at required" },
      { status: 400 },
    );
  }
  const adUrl = safeHttpsUrl(body.url);
  const bannerUrl = body.banner_url ? safeHttpsUrl(body.banner_url) : null;
  if (!adUrl) {
    return Response.json(
      { error: "url must be a valid HTTPS URL" },
      { status: 400 },
    );
  }
  if (body.banner_url && !bannerUrl) {
    return Response.json(
      { error: "banner_url must be a valid HTTPS URL" },
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
      position: body.position,
      url: adUrl,
      banner_url: bannerUrl,
      start_at: body.start_at,
      end_at: body.end_at,
      created_by: guard.admin.userId,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ad: data });
}
