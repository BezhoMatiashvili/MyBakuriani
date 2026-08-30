import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { Constants, type Database } from "@/lib/types/database";

export const runtime = "nodejs";

type Severity = "info" | "warning" | "critical";
type Channel = "push" | "email";
type Role = Database["public"]["Enums"]["user_role"];

const VALID_ROLES = new Set<string>(Constants.public.Enums.user_role);

type Body = {
  severity?: Severity;
  channel?: Channel;
  title?: string;
  subject?: string;
  message?: string;
  target_roles?: string[];
  target_user_ids?: string[];
  include_self?: boolean;
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (
    !body?.severity ||
    !body.channel ||
    !body.title?.trim() ||
    !body.message?.trim() ||
    !Array.isArray(body.target_roles) ||
    !Array.isArray(body.target_user_ids)
  ) {
    return Response.json(
      {
        error:
          "severity, channel, title, message, target_roles[], target_user_ids[] required",
      },
      { status: 400 },
    );
  }
  if (!["info", "warning", "critical"].includes(body.severity)) {
    return Response.json({ error: "invalid severity" }, { status: 400 });
  }
  if (body.channel !== "push" && body.channel !== "email") {
    return Response.json({ error: "invalid channel" }, { status: 400 });
  }
  const targetRoles = body.target_roles.filter((r): r is Role =>
    VALID_ROLES.has(r),
  );
  const targetUserIds = body.target_user_ids.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (targetRoles.length === 0 && targetUserIds.length === 0) {
    return Response.json(
      { error: "at least one role or user must be targeted" },
      { status: 400 },
    );
  }

  const db = createServiceClient(guard.admin.userId);

  // Resolve recipients: profiles.id where role in target_roles, UNION target_user_ids.
  const recipientIds = new Set<string>(targetUserIds);
  if (targetRoles.length > 0) {
    const { data: roleUsers, error: rErr } = await db
      .from("profiles")
      .select("id")
      .in("role", targetRoles);
    if (rErr) return Response.json({ error: rErr.message }, { status: 500 });
    for (const u of roleUsers ?? []) recipientIds.add(u.id);
  }
  if (!body.include_self) {
    recipientIds.delete(guard.admin.userId);
  }
  if (recipientIds.size === 0) {
    return Response.json(
      { error: "resolved recipient list is empty" },
      { status: 400 },
    );
  }

  const audienceFilter =
    targetRoles.length > 0 ? targetRoles.join(",") : "custom_users";
  const title = body.title.trim();
  const message = body.message.trim();
  const subject = body.subject?.trim() || null;

  const { data: record, error: bErr } = await db
    .from("broadcasts")
    .insert({
      channel: body.channel,
      audience_filter: audienceFilter,
      subject,
      body: message,
      recipient_count: recipientIds.size,
      sent_by: guard.admin.userId,
      severity: body.severity,
      target_roles: targetRoles,
      target_user_ids: targetUserIds,
      title,
    })
    .select()
    .single();
  if (bErr) return Response.json({ error: bErr.message }, { status: 500 });

  // Insert notifications (push channel only for now — email channel recorded but not wired to a provider yet).
  if (body.channel === "push") {
    const rows = Array.from(recipientIds).map((userId) => ({
      user_id: userId,
      type: "broadcast",
      title,
      message,
      severity: body.severity,
      broadcast_id: record.id,
    }));
    const { error: nErr } = await db.from("notifications").insert(rows);
    if (nErr) return Response.json({ error: nErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, broadcast: record });
}
