// SMS dispatch.
//
// Picks up rows in `sms_outbound` with status='approved' and hands each to the
// SMS provider via the isolated `sendSms()` adapter below, then marks the row
// 'sent' (with sent_at + provider_response) or 'failed'.
//
// The provider is not yet decided. `sendSms()` is the SINGLE integration point:
// it reads SMS_PROVIDER_API_KEY and, until a provider is wired, SKIPS every row
// (leaving it 'approved' so nothing is lost). Implement the marked TODO block to
// go live — no other file changes are needed.
//
// Auth: shared secret in SMS_DISPATCH_SECRET (Bearer header). The cron job and
// any manual invocations must present this token.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  ApiError,
  buildCorsHeaders,
  createServiceClient,
  errorResponse,
  getBearerToken,
  jsonResponse,
} from "../_shared/guards.ts";

const BATCH_SIZE = 25;

function requireSharedSecret(req: Request) {
  const expected = Deno.env.get("SMS_DISPATCH_SECRET");
  if (!expected) {
    throw new ApiError(
      "SMS_DISPATCH_SECRET is not configured",
      500,
      "ENV_MISSING",
    );
  }
  const token = getBearerToken(req);
  if (token !== expected) {
    throw new ApiError("Invalid shared secret", 401, "AUTH_UNAUTHORIZED");
  }
}

type SendResult = {
  status: "skipped" | "sent" | "failed";
  providerResponse: unknown;
};

// --- Provider adapter — the only place to wire a real SMS gateway. ----------
async function sendSms(phone: string, message: string): Promise<SendResult> {
  const key = Deno.env.get("SMS_PROVIDER_API_KEY");
  if (!key) {
    return {
      status: "skipped",
      providerResponse: { skipped: "no_provider_key" },
    };
  }

  // TODO(provider): wire the chosen gateway (UBILL / Twilio / etc.) here.
  //   Replace this block with a real `await fetch(<provider endpoint>, ...)`,
  //   authenticating with `key`, sending `message` to `phone`, then map the
  //   HTTP result to { status: 'sent' } on 2xx or { status: 'failed' } on a
  //   provider/network error. Keep the response payload in `providerResponse`.
  // Until implemented, skip so approved rows are preserved for later sending.
  return {
    status: "skipped",
    providerResponse: {
      skipped: "provider_not_implemented",
      to: phone,
      len: message.length,
    },
  };
}
// ---------------------------------------------------------------------------

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    requireSharedSecret(req);
    const db = createServiceClient();

    const { data: approved, error } = await db
      .from("sms_outbound")
      .select("id, recipient_phone, message")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of approved ?? []) {
      const result = await sendSms(row.recipient_phone, row.message);

      if (result.status === "skipped") {
        skipped++;
        continue; // leave the row 'approved' for a later run
      }

      const patch =
        result.status === "sent"
          ? {
              status: "sent",
              sent_at: new Date().toISOString(),
              provider_response: result.providerResponse,
            }
          : { status: "failed", provider_response: result.providerResponse };

      const { error: upErr } = await db
        .from("sms_outbound")
        .update(patch)
        .eq("id", row.id);

      if (upErr) {
        console.error("sms-dispatch: status update failed", upErr);
        continue;
      }

      if (result.status === "sent") sent++;
      else failed++;
    }

    return jsonResponse(
      {
        ok: true,
        considered: approved?.length ?? 0,
        sent,
        failed,
        skipped,
      },
      200,
      cors,
    );
  } catch (err) {
    return errorResponse(err, cors);
  }
});
