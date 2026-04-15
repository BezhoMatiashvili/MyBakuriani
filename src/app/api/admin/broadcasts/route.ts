import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";

export const runtime = "nodejs";

const AUDIENCE_FILTERS: Record<
  string,
  (q: ReturnType<typeof createServiceClient>) => {
    filter: string;
    roles: Database["public"]["Enums"]["user_role"][] | null;
  }
> = {
  all_verified_owners: () => ({
    filter: "all_verified_owners",
    roles: ["renter", "seller"],
  }),
  providers_only: () => ({
    filter: "providers_only",
    roles: ["cleaner", "food", "entertainment", "transport", "handyman"],
  }),
  employers_only: () => ({
    filter: "employers_only",
    roles: ["employment"],
  }),
  guests_only: () => ({ filter: "guests_only", roles: ["guest"] }),
  hostels: () => ({ filter: "hostels", roles: ["renter"] }),
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as {
    audience?: string;
    channel?: "push" | "email";
    subject?: string;
    message?: string;
  } | null;
  if (
    !body?.audience ||
    !body.channel ||
    !body.message?.trim() ||
    !AUDIENCE_FILTERS[body.audience]
  ) {
    return Response.json(
      { error: "audience, channel (push|email), message required" },
      { status: 400 },
    );
  }

  const db = createServiceClient();
  const audience = AUDIENCE_FILTERS[body.audience](db);

  // Resolve recipients.
  let recipientsQuery = db.from("profiles").select("id");
  if (audience.roles && audience.roles.length > 0) {
    recipientsQuery = recipientsQuery.in("role", audience.roles);
  }
  const { data: recipients, error: rErr } = await recipientsQuery;
  if (rErr) return Response.json({ error: rErr.message }, { status: 500 });

  // Insert notifications (push channel only for now — SMS deferred per decision; email channel recorded but not wired to a provider yet).
  if (body.channel === "push" && recipients && recipients.length > 0) {
    const rows = recipients.map((r) => ({
      user_id: r.id,
      type: "broadcast",
      title: body.subject?.trim() || "სიახლე MyBakuriani-სგან",
      message: body.message,
    }));
    const { error: nErr } = await db.from("notifications").insert(rows);
    if (nErr) return Response.json({ error: nErr.message }, { status: 500 });
  }

  const { data: record, error: bErr } = await db
    .from("broadcasts")
    .insert({
      channel: body.channel,
      audience_filter: audience.filter,
      subject: body.subject ?? null,
      body: body.message,
      recipient_count: recipients?.length ?? 0,
      sent_by: guard.admin.userId,
    })
    .select()
    .single();
  if (bErr) return Response.json({ error: bErr.message }, { status: 500 });

  return Response.json({ ok: true, broadcast: record });
}
