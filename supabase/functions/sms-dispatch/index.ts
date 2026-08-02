// SMS dispatch. See sms.md P5.
//
// Retires stale automation rows, picks up the next batch of sendable rows, hands each
// to the isolated `sendSms()` adapter, then marks the row 'sent' or 'failed'.
//
// THE CREDIT RULE LIVES IN SQL, NOT HERE. Three mutually exclusive billing paths run
// over this one table and this file must not re-implement any of them:
//   * controlled rental / price-drop rows are charged only by the future authenticated
//     delivery callback through sms_mark_provider_delivered
//   * legacy broadcast + 1:1 paths are retired and never enter this queue
//   * system rows (vip_activation / vip_expiry / subscription) -> free
//
// sms_claim_dispatch_batch applies eligibility maintenance, the 0-credit preflight,
// per-sender ranking, leases, and FIFO ordering. DO NOT re-implement those in TypeScript, and
// do not add a "broke senders" Set - the RPC already excludes those rows.
//
// The provider is not yet decided. `sendSms()` is the SINGLE integration point: until a
// provider is wired it SKIPS every row and releases its claim, leaving it 'approved'.
// SMS_DELIVERY_ENABLED is an independent fail-closed switch checked before claiming.
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
  status: "skipped" | "submitted" | "failed";
  providerMessageId?: string;
  providerResponse: unknown;
};

// --- Provider adapter — the only place to wire a real SMS gateway. ----------
async function sendSms(
  smsId: string,
  phone: string,
  message: string,
): Promise<SendResult> {
  const key = Deno.env.get("SMS_PROVIDER_API_KEY");
  if (!key) {
    return {
      status: "skipped",
      providerResponse: { skipped: "no_provider_key" },
    };
  }

  // TODO(B1 - provider): implement this and NOTHING ELSE in this file.
  //   Contract:
  //     - return { status: 'submitted', providerMessageId, providerResponse }
  //       on a 2xx/accepted gateway reply
  //     - return { status: 'failed', providerResponse } on any provider or network error
  //     - return { status: 'skipped', providerResponse } ONLY while unimplemented
  //   providerResponse MUST carry the gateway's message id (for reconciliation) and must
  //   NOT contain the API key.
  //   Billing: the caller charges exactly 1 credit per 'sent' row (D6) even though a
  //   Georgian UCS-2 message of 150-250 chars is 3-4 real segments. Do not "fix" that here.
  //   At-least-once: if the gateway succeeds and this function dies before sms_mark_sent,
  //   the row is re-sent next run. Use a provider idempotency key derived from sms_outbound.id.
  //
  //   NOTE for B1: the `if (!key) return skipped` guard above is DEAD as a gate, because
  //   this block returns unconditionally. Fix it when wiring the provider (sms.md B1).
  return {
    status: "skipped",
    providerResponse: {
      skipped: "provider_not_implemented",
      idempotency_key: smsId,
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

    let priceDropMaterialization: unknown = null;
    const priceDropMode = (Deno.env.get("SMS_PRICE_DROP_MODE") ?? "off").toLowerCase();
    if (priceDropMode !== "off") {
      if (priceDropMode !== "on" && priceDropMode !== "qa") {
        throw new ApiError("Invalid SMS_PRICE_DROP_MODE", 500, "ENV_INVALID");
      }
      const siteUrl = Deno.env.get("SITE_URL");
      if (!siteUrl || !/^https?:\/\//.test(siteUrl)) {
        throw new ApiError("SITE_URL is required for price-drop links", 500, "ENV_MISSING");
      }
      const { data, error: materializeError } = await db.rpc(
        "sms_materialize_due_price_drop_events",
        {
          p_site_url: siteUrl.replace(/\/+$/, ""),
          p_limit: 20,
          p_allowed_payers: priceDropMode === "qa"
            ? (Deno.env.get("SMS_QA_USER_IDS") ?? "").split(",").map((id) => id.trim()).filter(Boolean)
            : null,
        },
      );
      if (materializeError) throw materializeError;
      priceDropMaterialization = data;
    }

    // 1. Retire stale automation rows FIRST. This is that function's only caller.
    //    Doing it before the batch read is what lets the claim RPC carry no time
    //    predicate of its own - one window definition, in one place. A stale T1
    //    ("გელოდებით ხვალ") delivered days late is actively wrong, and a stale T3 embeds
    //    the owner's own time-bounded promo, i.e. a false offer they must honour or refuse.
    const { data: expiredRaw, error: expErr } = await db.rpc(
      "sms_expire_stale_automation",
    );
    if (expErr) throw expErr;
    const expired = Number(expiredRaw ?? 0);
    if (expired > 0) {
      console.log(`sms-dispatch: expired ${expired} stale row(s)`);
    }

    const { data: cancelledRaw, error: cancelErr } = await db.rpc(
      "sms_cancel_ineligible_automation",
    );
    if (cancelErr) throw cancelErr;
    const cancelled = Number(cancelledRaw ?? 0);
    const { data: cancelledPriceRaw, error: cancelledPriceError } = await db.rpc(
      "sms_cancel_ineligible_price_drop",
    );
    if (cancelledPriceError) throw cancelledPriceError;
    const cancelledPriceDrop = Number(cancelledPriceRaw ?? 0);

    // Queue generation is live before a provider is selected. Fail closed and
    // do not claim rows until delivery is deliberately enabled.
    if (Deno.env.get("SMS_DELIVERY_ENABLED") !== "true") {
      return jsonResponse(
        {
          ok: true,
          delivery_enabled: false,
          price_drop: priceDropMaterialization,
          expired,
          cancelled,
          cancelled_price_drop: cancelledPriceDrop,
          considered: 0,
          sent: 0,
          failed: 0,
          skipped: 0,
          charged: 0,
          uncharged: 0,
        },
        200,
        cors,
      );
    }

    // 2. Atomically claim a batch. A lease prevents overlapping cron runs from
    //    handing the same row to the provider.
    const claimToken = crypto.randomUUID();
    const { data: batch, error } = await db.rpc("sms_claim_dispatch_batch", {
      p_limit: BATCH_SIZE,
      p_claim_token: claimToken,
    });
    if (error) throw error;

    const rows = (batch ?? []) as Array<{
      id: string;
      recipient_phone: string;
      message: string;
    }>;

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let charged = 0;
    let uncharged = 0;

    for (const row of rows) {
      const result = await sendSms(row.id, row.recipient_phone, row.message);

      if (result.status === "skipped") {
        const { error: releaseErr } = await db.rpc(
          "sms_release_dispatch_claim",
          { p_claim_token: claimToken, p_sms_id: row.id },
        );
        if (releaseErr) throw releaseErr;
        skipped++;
        continue;
      }

      if (result.status === "submitted") {
        if (!result.providerMessageId) {
          throw new Error(`Provider accepted ${row.id} without a message id`);
        }
        const { error: markErr } = await db.rpc(
          "sms_mark_claim_submitted",
          {
            p_sms_id: row.id,
            p_claim_token: claimToken,
            p_provider_message_id: result.providerMessageId,
            p_provider_response: result.providerResponse ?? {},
          },
        );
        if (markErr) {
          console.error("sms-dispatch: sms_mark_sent failed", {
            id: row.id,
            error: markErr,
          });
          continue;
        }
        sent++;
        uncharged++;
      } else {
        // A failed send is never charged (spec section 6).
        const { error: failErr } = await db.rpc("sms_mark_claim_failed", {
          p_sms_id: row.id,
          p_claim_token: claimToken,
          p_provider_response: result.providerResponse ?? {},
        });
        if (failErr) {
          console.error("sms-dispatch: sms_mark_failed failed", {
            id: row.id,
            error: failErr,
          });
          continue;
        }
        failed++;
      }
    }

    return jsonResponse(
      {
        ok: true,
        price_drop: priceDropMaterialization,
        expired,
        cancelled,
        cancelled_price_drop: cancelledPriceDrop,
        considered: rows.length,
        sent,
        failed,
        skipped,
        charged,
        uncharged,
      },
      200,
      cors,
    );
  } catch (err) {
    return errorResponse(err, cors);
  }
});
