import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { criticalReserve } from "@/lib/email/budget";
import { getEmailConfig, type EmailConfig } from "@/lib/email/config";
import {
  isReservedAddress,
  recipientAllowed,
  RESERVED_TLDS,
} from "@/lib/email/recipients";
import {
  insertNotificationsChunked,
  loadAudienceUserIds,
} from "@/lib/notifications/audience";
import { Constants, type Database } from "@/lib/types/database";

export const runtime = "nodejs";

type Severity = "info" | "warning" | "critical";
type Channel = "push" | "email";
type Role = Database["public"]["Enums"]["user_role"];
type Db = ReturnType<typeof createServiceClient>;

const VALID_ROLES = new Set<string>(Constants.public.Enums.user_role);

// email_claim_batch cancels queued mail older than 3 days ("expired"), so an
// email broadcast must fit in three days of the daily budget it shares.
const EMAIL_QUEUE_DAYS = 3;
// Ids per recipients RPC call: stays under PostgREST's max-rows cap (1000).
const EMAIL_LOOKUP_CHUNK = 500;
const EMAIL_INSERT_CHUNK = 500;

type EmailCounts = {
  queued: number;
  no_consent: number;
  no_email: number;
  suppressed: number;
  /** Outside EMAIL_ALLOWED_RECIPIENTS, or a reserved test domain. */
  not_allowed: number;
  /** Broadcast mail the dispatcher may still send today. */
  sendable_today: number;
  /** Broadcast mail the queue can take before rows expire. */
  capacity: number;
};
type EmailPlan = {
  rows: { user_id: string; to_email: string }[];
  counts: EmailCounts;
};

/**
 * Admin email broadcasts (C33) are marketing: mailed only to users with
 * profiles.marketing_email_consent = true (admin_broadcast_email_recipients),
 * a confirmed address and no suppression, inside the recipient allow-list.
 */
async function planBroadcastEmail(
  db: Db,
  config: EmailConfig,
  userIds: string[],
): Promise<EmailPlan | { error: string }> {
  const counts: EmailCounts = {
    queued: 0,
    no_consent: 0,
    no_email: 0,
    suppressed: 0,
    not_allowed: 0,
    sendable_today: 0,
    capacity: 0,
  };
  const rows: EmailPlan["rows"] = [];
  for (let i = 0; i < userIds.length; i += EMAIL_LOOKUP_CHUNK) {
    const { data, error } = await db.rpc("admin_broadcast_email_recipients", {
      p_user_ids: userIds.slice(i, i + EMAIL_LOOKUP_CHUNK),
    });
    if (error) return { error: error.message };
    for (const r of data ?? []) {
      if (r.outcome === "no_consent") counts.no_consent += 1;
      else if (r.outcome === "suppressed") counts.suppressed += 1;
      else if (r.outcome !== "ok" || !r.email) counts.no_email += 1;
      else if (
        isReservedAddress(r.email) ||
        !recipientAllowed(config.allowedRecipients, r.email)
      ) {
        counts.not_allowed += 1;
      } else rows.push({ user_id: r.user_id, to_email: r.email });
    }
  }
  counts.queued = rows.length;

  // The dispatcher's daily budget for classes 2+ (src/lib/email/budget.ts),
  // minus today's sends and the mail already waiting in the queue.
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  let waitingQuery = db
    .from("email_outbound")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "sending"]);
  // Rows to reserved test domains (e2e accounts) are only ever cancelled.
  for (const tld of RESERVED_TLDS) {
    waitingQuery = waitingQuery.not("to_email", "like", `%.${tld}`);
  }
  const [sent, waiting] = await Promise.all([
    db
      .from("email_outbound")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", dayStart.toISOString()),
    waitingQuery,
  ]);
  if (sent.error) return { error: sent.error.message };
  if (waiting.error) return { error: waiting.error.message };
  const daily = config.dailyCap - criticalReserve(config.dailyCap);
  const used = (sent.count ?? 0) + (waiting.count ?? 0);
  counts.sendable_today = Math.min(rows.length, Math.max(0, daily - used));
  counts.capacity = Math.max(0, daily * EMAIL_QUEUE_DAYS - used);
  return { rows, counts };
}

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
  // Without these the dispatcher sends nothing: refuse instead of recording a
  // broadcast nobody receives.
  const emailConfig = body.channel === "email" ? getEmailConfig() : null;
  if (
    emailConfig &&
    (!emailConfig.deliveryEnabled ||
      !emailConfig.resendApiKey ||
      !emailConfig.siteUrl ||
      (emailConfig.allowedRecipients !== "all" &&
        emailConfig.allowedRecipients.size === 0))
  ) {
    return Response.json({ error: "email_not_configured" }, { status: 503 });
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

  // Resolve recipients: users holding a target role (profile role OR the
  // cabinet derived from owned data), UNION target_user_ids.
  const recipientIds = new Set<string>(targetUserIds);
  if (targetRoles.length > 0) {
    try {
      for (const id of await loadAudienceUserIds(db, targetRoles)) {
        recipientIds.add(id);
      }
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "audience lookup failed" },
        { status: 500 },
      );
    }
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

  let email: EmailPlan | null = null;
  if (emailConfig) {
    const plan = await planBroadcastEmail(
      db,
      emailConfig,
      Array.from(recipientIds),
    );
    if ("error" in plan) {
      return Response.json({ error: plan.error }, { status: 500 });
    }
    if (plan.rows.length === 0) {
      return Response.json(
        { error: "no_email_recipients", email: plan.counts },
        { status: 400 },
      );
    }
    if (plan.rows.length > plan.counts.capacity) {
      return Response.json(
        { error: "over_email_capacity", email: plan.counts },
        { status: 409 },
      );
    }
    email = plan;
  }

  const { data: record, error: bErr } = await db
    .from("broadcasts")
    .insert({
      channel: body.channel,
      audience_filter: audienceFilter,
      subject,
      body: message,
      recipient_count: email ? email.rows.length : recipientIds.size,
      sent_by: guard.admin.userId,
      severity: body.severity,
      target_roles: targetRoles,
      target_user_ids: targetUserIds,
      title,
    })
    .select()
    .single();
  if (bErr) return Response.json({ error: bErr.message }, { status: 500 });

  // Email: one email_outbound row per recipient (no bell notification); the
  // dispatcher sends them after all transactional mail (class 4, C33).
  if (email) {
    const rows = email.rows.map((r) => ({
      ...r,
      notification_type: "broadcast",
      subject: (subject ?? title).slice(0, 200),
      body: message.slice(0, 4000),
    }));
    let queued = 0;
    for (let i = 0; i < rows.length; i += EMAIL_INSERT_CHUNK) {
      const chunk = rows.slice(i, i + EMAIL_INSERT_CHUNK);
      const { error: eErr } = await db.from("email_outbound").insert(chunk);
      if (eErr) {
        await db
          .from("broadcasts")
          .update({ recipient_count: queued })
          .eq("id", record.id);
        return Response.json(
          { error: eErr.message, delivered: queued, recipients: rows.length },
          { status: 500 },
        );
      }
      queued += chunk.length;
    }
    return Response.json({ ok: true, broadcast: record, email: email.counts });
  }

  // Push: a bell notification per recipient.
  if (body.channel === "push") {
    const rows = Array.from(recipientIds).map((userId) => ({
      user_id: userId,
      type: "broadcast",
      title,
      message,
      severity: body.severity,
      broadcast_id: record.id,
    }));
    const { delivered, error: nErr } = await insertNotificationsChunked(
      db,
      rows,
    );
    if (nErr) {
      // Keep the history row honest: record what was actually delivered.
      await db
        .from("broadcasts")
        .update({ recipient_count: delivered })
        .eq("id", record.id);
      return Response.json(
        { error: nErr, delivered, recipients: recipientIds.size },
        { status: 500 },
      );
    }
  }

  return Response.json({ ok: true, broadcast: record });
}
