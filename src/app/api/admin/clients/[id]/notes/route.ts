import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    admin_notes?: string | null;
  } | null;
  const db = createServiceClient(guard.admin.userId);
  // profile_admin_notes replaced profiles.admin_notes (security audit C2 fix,
  // which moved these notes to a deny-all side table) — not yet in the
  // generated DB types, hence the cast.
  const { error } = await (
    db.from as unknown as (table: "profile_admin_notes") => {
      upsert: (
        row: { profile_id: string; notes: string | null; updated_at: string },
        opts: { onConflict: string },
      ) => Promise<{ error: unknown }>;
    }
  )("profile_admin_notes").upsert(
    {
      profile_id: id,
      notes: body?.admin_notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" },
  );
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
