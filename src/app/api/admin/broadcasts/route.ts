import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";

export const runtime = "nodejs";

type Severity = "info" | "warning" | "critical";
type Channel = "push" | "email";
type Role = Database["public"]["Enums"]["user_role"];

const VALID_SEVERITIES: Severity[] = ["info", "warning", "critical"];
const VALID_CHANNELS: Channel[] = ["push", "email"];
const VALID_ROLES: Role[] = [
  "guest",
  "renter",
  "seller",
  "cleaner",
  "food",
  "entertainment",
  "transport",
  "employment",
  "handyman",
  "admin",
];

// Legacy audience presets (kept for backward compatibility with older callers).
// These resolve to role lists server-side; the new UI sends `target_roles` directly.
const AUDIENCE_PRESETS: Record<string, Role[]> = {
  all_verified_owners: ["renter", "seller"],
  providers_only: ["cleaner", "food", "entertainment", "transport", "handyman"],
  employers_only: ["employment"],
  guests_only: ["guest"],
  hostels: ["renter"],
};

interface BroadcastBody {
  severity?: Severity;
  channel?: Channel;
  title?: string;
  subject?: string;
  message?: string;
  target_roles?: string[];
  target_user_ids?: string[];
  audience?: string;
  include_self?: boolean;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as BroadcastBody | null;
  if (!body) {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  const severity: Severity = VALID_SEVERITIES.includes(
    body.severity as Severity,
  )
    ? (body.severity as Severity)
    : "info";
  const channel = body.channel;
  if (!channel || !VALID_CHANNELS.includes(channel)) {
    return Response.json(
      { error: "channel must be 'push' or 'email'" },
      { status: 400 },
    );
  }
  const message = body.message?.trim();
  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  // Resolve role list: explicit target_roles, else legacy audience preset, else none.
  let targetRoles: Role[] = [];
  if (Array.isArray(body.target_roles) && body.target_roles.length > 0) {
    targetRoles = body.target_roles.filter((r): r is Role =>
      VALID_ROLES.includes(r as Role),
    );
  } else if (body.audience && AUDIENCE_PRESETS[body.audience]) {
    targetRoles = AUDIENCE_PRESETS[body.audience];
  }

  // Validate explicit user-id list.
  const targetUserIds = Array.isArray(body.target_user_ids)
    ? body.target_user_ids.filter(
        (id) => typeof id === "string" && id.length > 0,
      )
    : [];

  if (targetRoles.length === 0 && targetUserIds.length === 0) {
    return Response.json(
      { error: "must target at least one role or user" },
      { status: 400 },
    );
  }

  const db = createServiceClient();

  // Build the recipient set: union of (profiles by role) ∪ (explicit user ids).
  const recipientSet = new Set<string>();
  if (targetRoles.length > 0) {
    const { data: roleRows, error: roleErr } = await db
      .from("profiles")
      .select("id")
      .in("role", targetRoles);
    if (roleErr) {
      return Response.json({ error: roleErr.message }, { status: 500 });
    }
    for (const r of roleRows ?? []) recipientSet.add(r.id);
  }
  if (targetUserIds.length > 0) {
    // Confirm these ids exist as profiles to avoid orphan notifications.
    const { data: idRows, error: idErr } = await db
      .from("profiles")
      .select("id")
      .in("id", targetUserIds);
    if (idErr) {
      return Response.json({ error: idErr.message }, { status: 500 });
    }
    for (const r of idRows ?? []) recipientSet.add(r.id);
  }

  // Exclude the sending admin unless they opted in.
  if (!body.include_self) {
    recipientSet.delete(guard.admin.userId);
  }

  const recipients = Array.from(recipientSet);
  if (recipients.length === 0) {
    return Response.json(
      { error: "resolved recipient list is empty" },
      { status: 400 },
    );
  }

  // Build a human-readable audience label for the broadcasts table.
  const audienceLabel =
    body.audience ??
    (targetRoles.length > 0 && targetUserIds.length > 0
      ? "roles_and_users"
      : targetUserIds.length > 0
        ? "specific_users"
        : "custom_roles");

  const title = body.title?.trim() || null;
  const subject = body.subject?.trim() || null;

  // Insert the broadcast record first so notifications can reference its id.
  const { data: broadcast, error: bErr } = await db
    .from("broadcasts")
    .insert({
      channel,
      severity,
      audience_filter: audienceLabel,
      target_roles: targetRoles.length > 0 ? targetRoles : null,
      target_user_ids: targetUserIds.length > 0 ? targetUserIds : null,
      title,
      subject,
      body: message,
      recipient_count: recipients.length,
      sent_by: guard.admin.userId,
    })
    .select()
    .single();
  if (bErr) return Response.json({ error: bErr.message }, { status: 500 });

  // Insert per-user notifications for push channel.
  // Email channel doesn't write notifications (deferred until an email provider is wired).
  if (channel === "push") {
    const defaultTitle = title || subject || "სიახლე MyBakuriani-სგან";
    const rows = recipients.map((uid) => ({
      user_id: uid,
      type: "broadcast",
      title: defaultTitle,
      message,
      severity,
      broadcast_id: broadcast.id,
    }));
    const { error: nErr } = await db.from("notifications").insert(rows);
    if (nErr) return Response.json({ error: nErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, broadcast });
}
