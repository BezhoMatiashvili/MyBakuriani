import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { getEmailConfig } from "@/lib/email/config";
import { renderNotificationEmail } from "@/lib/email/render";
import { sendWithResend } from "@/lib/email/resend";
import { syncResendContact } from "@/lib/email/resend-contacts";
import { safeInternalPath } from "@/lib/security";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH = 25;
const MAX_ATTEMPTS = 6;
const TIME_BUDGET_MS = 20_000;

/** Bearer check against EMAIL_DISPATCH_SECRET_SHA256 (the secret stays in Vault). */
function authorized(request: Request): "ok" | "denied" | "unconfigured" {
  const expected = (process.env.EMAIL_DISPATCH_SECRET_SHA256 ?? "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) return "unconfigured";
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return "denied";
  const digest = createHash("sha256").update(token, "utf8").digest();
  return timingSafeEqual(digest, Buffer.from(expected, "hex"))
    ? "ok"
    : "denied";
}

type Db = ReturnType<typeof createServiceClient>;
type Config = ReturnType<typeof getEmailConfig>;

function recipientAllowed(config: Config, email: string): boolean {
  return (
    config.allowedRecipients === "all" || config.allowedRecipients.has(email)
  );
}

/**
 * Email dispatcher (C33), driven by pg_cron every 5 minutes. Server to server:
 * exempt from the middleware Origin check (src/lib/email/server-paths.ts).
 *
 *   1. transactional: claim queued email_outbound rows, send each through
 *      Resend (Idempotency-Key = row id), mark sent / retry / failed;
 *   2. marketing: push pending email_marketing_sync rows to Resend contacts
 *      (the `unsubscribed` flag that Resend Broadcasts honour).
 *
 * Every write back is guarded by the claim token, so a row that another run
 * re-claimed after our lease expired is never overwritten by us.
 */
export async function POST(request: Request) {
  const auth = authorized(request);
  if (auth === "unconfigured") {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  if (auth === "denied") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const config = getEmailConfig();
  if (!config.deliveryEnabled) {
    return Response.json({ delivery_enabled: false });
  }
  if (!config.siteUrl) {
    return Response.json({ error: "site_url_missing" }, { status: 503 });
  }
  // No allow-list at all: send nothing and claim nothing (queued mail waits).
  // Everyone is only ever mailed with an explicit EMAIL_ALLOWED_RECIPIENTS="*".
  if (config.allowedRecipients !== "all" && config.allowedRecipients.size === 0) {
    return Response.json({ error: "recipient_allowlist_unset" }, { status: 503 });
  }

  const db = createServiceClient();
  const started = Date.now();
  const transactional = await dispatchTransactional(db, config, started);
  const marketing = await syncMarketing(db, config, started);
  return Response.json({ delivery_enabled: true, transactional, marketing });
}

async function dispatchTransactional(
  db: Db,
  config: Config,
  started: number,
) {
  const counts = {
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    cancelled: 0,
    released: 0,
  };
  if (!config.resendApiKey) return { ...counts, skipped: "no_resend_key" };

  // Daily cap: Supabase Auth mail shares the Resend allowance, so notification
  // mail stops short of it. Counted from our own log, per UTC day.
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count: sentToday, error: countError } = await db
    .from("email_outbound")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", dayStart.toISOString());
  if (countError) {
    console.error("[email] daily count failed", countError.code);
    return { ...counts, error: "count_failed" };
  }
  const room = Math.min(BATCH, config.dailyCap - (sentToday ?? 0));
  if (room <= 0) return { ...counts, skipped: "daily_cap" };

  const token = randomUUID();
  const { data, error } = await db.rpc("email_claim_batch", {
    p_limit: room,
    p_claim_token: token,
  });
  if (error) {
    console.error("[email] claim failed", error.code);
    return { ...counts, error: "claim_failed" };
  }
  const rows = data ?? [];
  counts.claimed = rows.length;

  const finish = (id: string, patch: Record<string, unknown>) =>
    db
      .from("email_outbound")
      .update({ claim_token: null, ...patch })
      .eq("id", id)
      .eq("claim_token", token);
  const releaseFrom = async (
    index: number,
    delayMs: number,
    reason: string,
  ) => {
    const ids = rows.slice(index).map((row) => row.id);
    if (!ids.length) return;
    await db
      .from("email_outbound")
      .update({
        status: "queued",
        claim_token: null,
        next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
        last_error: reason,
      })
      .in("id", ids)
      .eq("claim_token", token);
    counts.released += ids.length;
  };

  const accountUrl = `${config.siteUrl}/dashboard/account`;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (Date.now() - started > TIME_BUDGET_MS) {
      await releaseFrom(i, 0, "time_budget");
      break;
    }
    if (!recipientAllowed(config, row.to_email)) {
      await finish(row.id, {
        status: "cancelled",
        last_error: "not_in_allowlist",
      });
      counts.cancelled += 1;
      continue;
    }

    const path = safeInternalPath(row.action_url);
    const email = renderNotificationEmail({
      subject: row.subject,
      body: row.body,
      href: path ? `${config.siteUrl}${path}` : null,
      accountUrl,
    });
    const outcome = await sendWithResend(config.resendApiKey, {
      id: row.id,
      from: config.from,
      replyTo: config.replyTo ?? undefined,
      to: row.to_email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tag: row.notification_type,
    });

    if (outcome.kind === "sent") {
      await finish(row.id, {
        status: "sent",
        provider_message_id: outcome.providerMessageId,
        sent_at: new Date().toISOString(),
        last_error: null,
      });
      counts.sent += 1;
    } else if (outcome.kind === "failed") {
      await finish(row.id, { status: "failed", last_error: outcome.error });
      counts.failed += 1;
    } else if (outcome.kind === "retry") {
      if (row.attempts >= MAX_ATTEMPTS) {
        await finish(row.id, { status: "failed", last_error: outcome.error });
        counts.failed += 1;
      } else {
        await finish(row.id, {
          status: "queued",
          next_attempt_at: new Date(
            Date.now() + outcome.retryAfterMs,
          ).toISOString(),
          last_error: outcome.error,
        });
        counts.retried += 1;
      }
    } else {
      // quota or misconfigured: nothing else in this batch can go out either.
      console.error(`[email] stopping batch: ${outcome.error}`);
      await releaseFrom(
        i,
        outcome.kind === "quota" ? outcome.retryAfterMs : 15 * 60_000,
        outcome.error,
      );
      break;
    }
  }
  return counts;
}

async function syncMarketing(
  db: Db,
  config: Config,
  started: number,
) {
  const counts = {
    claimed: 0,
    subscribed: 0,
    unsubscribed: 0,
    retried: 0,
    skipped: 0,
  };
  if (!config.resendApiKey) {
    return { ...counts, skipped_reason: "no_resend_key" };
  }

  const token = randomUUID();
  const { data, error } = await db.rpc("email_marketing_claim", {
    p_limit: BATCH,
    p_claim_token: token,
  });
  if (error) {
    console.error("[email] marketing claim failed", error.code);
    return { ...counts, error: "claim_failed" };
  }
  const rows = data ?? [];
  counts.claimed = rows.length;

  const complete = (userId: string, lastError: string | null) =>
    db
      .from("email_marketing_sync")
      .update({
        synced_at: new Date().toISOString(),
        claim_token: null,
        last_error: lastError,
      })
      .eq("user_id", userId)
      .eq("claim_token", token);
  const release = (userIds: string[], lastError: string) =>
    db
      .from("email_marketing_sync")
      .update({ claim_token: null, claimed_at: null, last_error: lastError })
      .in("user_id", userIds)
      .eq("claim_token", token);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (Date.now() - started > TIME_BUDGET_MS) {
      await release(
        rows.slice(i).map((r) => r.user_id),
        "time_budget",
      );
      break;
    }
    if (!row.email) {
      await complete(row.user_id, "no_confirmed_email");
      counts.skipped += 1;
      continue;
    }
    if (!recipientAllowed(config, row.email)) {
      await complete(row.user_id, "not_in_allowlist");
      counts.skipped += 1;
      continue;
    }

    const outcome = await syncResendContact(config.resendApiKey, {
      email: row.email,
      name: row.display_name,
      subscribed: row.subscribed,
    });

    if (outcome.kind === "done") {
      await complete(row.user_id, null);
      if (row.subscribed) counts.subscribed += 1;
      else counts.unsubscribed += 1;
    } else if (outcome.kind === "retry") {
      await release([row.user_id], outcome.error);
      counts.retried += 1;
    } else {
      console.error(`[email] stopping marketing sync: ${outcome.error}`);
      await release(
        rows.slice(i).map((r) => r.user_id),
        outcome.error,
      );
      break;
    }
  }
  return counts;
}
