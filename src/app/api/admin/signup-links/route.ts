import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  generateSignupLinkCode,
  normalizeSignupLinkCode,
  validateSignupLinkDestination,
} from "@/lib/signup-links";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const db = createServiceClient();
  const { data, error } = await db
    .from("signup_links")
    .select("id, code, label, destination, is_active, created_at")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ links: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as {
    code?: string;
    label?: string;
    destination?: string;
  } | null;

  const label = body?.label?.trim() ?? "";
  if (!label || label.length > 120) {
    return Response.json({ error: "invalid_label" }, { status: 400 });
  }
  const destination = validateSignupLinkDestination(body?.destination);
  if (!destination) {
    return Response.json({ error: "invalid_destination" }, { status: 400 });
  }
  const customCode = body?.code?.trim() ? body.code : null;
  const code = customCode
    ? normalizeSignupLinkCode(customCode)
    : generateSignupLinkCode();
  if (!code) return Response.json({ error: "invalid_code" }, { status: 400 });

  const db = createServiceClient(guard.admin.userId);
  const { data, error } = await db
    .from("signup_links")
    .insert({ code, label, destination, created_by: guard.admin.userId })
    .select("id, code, label, destination, is_active, created_at")
    .single();
  if (error?.code === "23505") {
    return Response.json({ error: "code_taken" }, { status: 409 });
  }
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ link: data });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = createServiceClient(guard.admin.userId);
  const { error } = await db
    .from("signup_links")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
