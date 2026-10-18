import { MARKETING_POLICY_VERSION } from "@/lib/consent/channels";
import { verifySvixSignature } from "@/lib/email/svix";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Db = ReturnType<typeof createServiceClient>;

/**
 * Resend webhook (C33). Svix-signed; server to server, exempt from the
 * middleware Origin check (src/lib/email/server-paths.ts).
 *
 *   email.bounced (Permanent), email.complained
 *       -> email_suppressions: the address is never mailed again
 *   contact.updated with unsubscribed = true (Broadcast unsubscribe link)
 *       -> marketing_email consent withdrawn through self_service_record_consent
 *          (the ONLY consent writer, C30), source 'email_unsubscribe'
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret)
    return Response.json({ error: "not_configured" }, { status: 503 });

  const body = await request.text();
  const valid = verifySvixSignature({
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
  });
  if (!valid)
    return Response.json({ error: "invalid_signature" }, { status: 401 });

  let event: { type?: unknown; data?: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const data = event.data ?? {};
  const db = createServiceClient();
  if (event.type === "contact.updated" || event.type === "contact.created") {
    return handleContact(db, data);
  }

  const bounce = (data.bounce ?? {}) as Record<string, unknown>;
  let reason: "bounce" | "complaint" | null = null;
  if (event.type === "email.complained") reason = "complaint";
  // Transient/undetermined bounces are left to Resend's own retries.
  if (event.type === "email.bounced" && bounce.type === "Permanent")
    reason = "bounce";
  if (!reason) return Response.json({ ignored: true });

  const recipients = (Array.isArray(data.to) ? data.to : [data.to])
    .filter((to): to is string => typeof to === "string" && to.includes("@"))
    .map((to) => to.trim().toLowerCase());
  if (!recipients.length) return Response.json({ ignored: true });

  const { error } = await db.from("email_suppressions").upsert(
    recipients.map((email) => ({
      email,
      reason,
      provider: "resend",
      detail: {
        email_id: typeof data.email_id === "string" ? data.email_id : null,
        subType: typeof bounce.subType === "string" ? bounce.subType : null,
      },
    })),
    { onConflict: "email", ignoreDuplicates: true },
  );
  if (error) {
    console.error(
      "[email] resend webhook: suppression insert failed",
      error.code,
    );
    return Response.json({ error: "store_failed" }, { status: 500 });
  }
  return Response.json({ suppressed: recipients.length });
}

/**
 * Only an unsubscribe of a user who is CURRENTLY opted in is recorded. Our own
 * dispatcher also sets `unsubscribed` when a user switches email off in the
 * app, and Resend echoes that back as contact.updated — which must not write
 * a second, mislabelled withdrawal.
 */
async function handleContact(db: Db, data: Record<string, unknown>) {
  if (data.unsubscribed !== true) return Response.json({ ignored: true });
  const email =
    typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  if (!email.includes("@")) return Response.json({ ignored: true });

  const { data: ids, error } = await db.rpc("email_user_ids_for_address", {
    p_email: email,
  });
  if (error) {
    console.error("[email] resend webhook: user lookup failed", error.code);
    return Response.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!ids?.length) return Response.json({ ignored: true });

  const { data: optedIn, error: readError } = await db
    .from("profiles")
    .select("id")
    .in("id", ids)
    .eq("marketing_email_consent", true);
  if (readError) {
    console.error(
      "[email] resend webhook: consent read failed",
      readError.code,
    );
    return Response.json({ error: "lookup_failed" }, { status: 500 });
  }

  for (const { id } of optedIn ?? []) {
    const { error: consentError } = await db.rpc(
      "self_service_record_consent",
      {
        p_actor_id: id,
        p_values: {
          marketing_email: false,
          source: "email_unsubscribe",
          version: MARKETING_POLICY_VERSION,
        },
      },
    );
    if (consentError) {
      console.error(
        "[email] resend webhook: consent write failed",
        consentError.code,
      );
      return Response.json({ error: "consent_failed" }, { status: 500 });
    }
  }
  return Response.json({ unsubscribed: optedIn?.length ?? 0 });
}
