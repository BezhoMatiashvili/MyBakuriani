import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { json } from "@/lib/admin-statuses-server";
import { isUuid, verificationPatch } from "@/lib/user-groups";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Toggles profiles.is_verified. There is no "block/ban" column — this is the
// only thing the client-detail page's verification toggle has ever done.
// It also keeps verified_at in step (C52): the date is stamped when an account
// becomes verified and cleared when it stops being; asking for the state the
// account already has changes nothing, so a re-verify keeps the original date.
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!id) return json({ error: "id required" }, 400);
  if (!isUuid(id)) return json({ error: "invalid_id" }, 400);

  const body = (await req.json().catch(() => null)) as {
    is_verified?: boolean;
  } | null;
  if (typeof body?.is_verified !== "boolean") {
    return json({ error: "is_verified must be boolean" }, 400);
  }
  const next = body.is_verified;

  const db = createServiceClient(guard.admin.userId);
  // Only a row that really changes is written: the filter is the transition.
  const update = db
    .from("profiles")
    .update(verificationPatch(next, new Date().toISOString()))
    .eq("id", id);
  const { data: changed, error } = await (
    next
      ? update.or("is_verified.is.null,is_verified.eq.false")
      : update.eq("is_verified", true)
  ).select("id, is_verified, verified_at");
  if (error) {
    console.error("[verified-users] verify update failed", {
      code: error.code,
      message: error.message,
    });
    return json({ error: "server_error" }, 500);
  }
  if (changed?.[0]) {
    return json({
      ok: true,
      changed: true,
      is_verified: changed[0].is_verified === true,
      verified_at: changed[0].verified_at,
    });
  }

  // Nothing matched: an unknown id, or the account is already in that state.
  const { data: current, error: readError } = await db
    .from("profiles")
    .select("is_verified, verified_at")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("[verified-users] verify read failed", {
      code: readError.code,
      message: readError.message,
    });
    return json({ error: "server_error" }, 500);
  }
  if (!current) return json({ error: "not_found" }, 404);
  return json({
    ok: true,
    changed: false,
    is_verified: current.is_verified === true,
    verified_at: current.verified_at,
  });
}
