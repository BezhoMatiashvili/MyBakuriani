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
// Provider: uBill.ge (api.ubill.dev). `sendSms()` is the SINGLE send integration point
// for queued rows; its POST is `_shared/ubill.ts:ubillSend`, shared with auth-send-sms (C48).
// Delivery reports come from the reconcileSubmitted() poll below (uBill's report API); the
// uBill callback URL (sms-delivery-report) is removed, since uBill's GET query lands in the
// function logs (owner's technical task 2026-10-25).
// SMS_DELIVERY_ENABLED is an independent fail-closed switch checked before claiming.
// Recipients: _shared/sms-recipients.ts. SMS_TEST_RECIPIENTS (comma-separated numbers) set =
// only those numbers; unset = everyone on the production project only, nobody elsewhere.
// Every other row fails as recipient_not_allowlisted without a provider call or a charge.
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
import { secretsEqual } from "../_shared/secrets.ts";
import {
  fetchUbillReportStatus,
  toUbillNumber,
  UBILL_SMS_API,
  UBILL_TIMEOUT_MS,
  ubillSend,
  type UbillSendReply,
} from "../_shared/ubill.ts";
import {
  recipientAllowed,
  recipientPolicy,
} from "../_shared/sms-recipients.ts";
import { classifyReply } from "./outcome.ts";

const BATCH_SIZE = 25;

async function requireSharedSecret(req: Request) {
  const expected = Deno.env.get("SMS_DISPATCH_SECRET");
  if (!expected) {
    throw new ApiError(
      "SMS_DISPATCH_SECRET is not configured",
      500,
      "ENV_MISSING",
    );
  }
  const token = getBearerToken(req);
  if (!(await secretsEqual(token, expected))) {
    throw new ApiError("Invalid shared secret", 401, "AUTH_UNAUTHORIZED");
  }
}

type SendResult = {
  status: "skipped" | "submitted" | "failed";
  providerMessageId?: string;
  providerResponse: unknown;
  // Provider trouble (a refusal, or a reply that may follow a sent text): release
  // every remaining row in the batch and stop sending.
  haltBatch?: boolean;
};

const RECONCILE_BATCH = 25;
// A submitted row is first asked about 2 minutes after it went out, then at most
// every 5 minutes, least recently asked first.
const POLL_AFTER_MS = 2 * 60_000;
const POLL_EVERY_MS = 5 * 60_000;

// --- Provider adapter — the only place that sends through the gateway. -------
// uBill has no idempotency key. The row is stamped send-started before this runs
// (sms_mark_send_started), so it is never handed out again; anything that may have
// gone out (outcome.ts "unknown": a network error, a timeout, an unreadable or
// id-less reply) fails with outcome "unknown" and is never repeated or charged.
// Only a definite refusal is released, to be retried later with a back-off.
async function sendSms(
  number: string,
  message: string,
  key: string,
  brandId: number,
): Promise<SendResult> {
  let reply: UbillSendReply;
  try {
    reply = await ubillSend({
      key,
      brandId,
      number,
      text: message,
      stopList: true,
    });
  } catch (err) {
    return {
      status: "failed",
      providerResponse: {
        provider: "ubill",
        error: "network",
        outcome: "unknown",
        detail: String(err).slice(0, 200),
      },
      haltBatch: true,
    };
  }

  const outcome = classifyReply(reply);
  const providerResponse = { provider: "ubill", ...reply };
  switch (outcome.kind) {
    case "submitted":
      return {
        status: "submitted",
        providerMessageId: outcome.smsId,
        providerResponse,
      };
    case "failed":
      return { status: "failed", providerResponse };
    case "unknown":
      console.error("sms-dispatch: provider reply in doubt", {
        http: reply.http,
        statusID: reply.statusID,
        reason: outcome.reason,
      });
      return {
        status: "failed",
        providerResponse: {
          ...providerResponse,
          outcome: "unknown",
          error: outcome.reason,
        },
        haltBatch: true,
      };
    case "refused":
      console.error("sms-dispatch: provider refused batch", providerResponse);
      return { status: "skipped", providerResponse, haltBatch: true };
  }
}

// uBill accepted the text: record it (and take the credit, C18). A lost reply is
// retried; P0002 then means an earlier attempt already recorded it. False = sent but
// unrecorded: the row stays claimed and started, so it is never sent again, and
// sms_fail_in_doubt_sends fails it as unknown after 15 minutes.
async function markSubmitted(
  db: ReturnType<typeof createServiceClient>,
  id: string,
  claimToken: string,
  providerMessageId: string,
  providerResponse: unknown,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));
    const { error } = await db.rpc("sms_mark_claim_submitted", {
      p_sms_id: id,
      p_claim_token: claimToken,
      p_provider_message_id: providerMessageId,
      p_provider_response: providerResponse ?? {},
    });
    if (!error) return true;
    if (error.code === "P0002") {
      const { data } = await db
        .from("sms_outbound")
        .select("status, provider_message_id")
        .eq("id", id)
        .maybeSingle();
      return data?.status === "submitted" &&
        data?.provider_message_id === providerMessageId;
    }
    console.error("sms-dispatch: sms_mark_claim_submitted failed", {
      id,
      attempt,
      code: error.code,
      message: error.message,
    });
  }
  return false;
}

// Sender name: SMS_PROVIDER_BRAND_NAME (e.g. "MyBakuriani") is used as soon as
// uBill has authorized it; until then SMS_PROVIDER_BRAND_ID is the fallback.
async function resolveBrand(
  key: string,
): Promise<{ id: number; source: string }> {
  const fallback = Number(Deno.env.get("SMS_PROVIDER_BRAND_ID"));
  const name = Deno.env.get("SMS_PROVIDER_BRAND_NAME")?.trim();
  if (!name) return { id: fallback, source: "fallback" };
  try {
    // Reply shape (observed 2026-09-26; the docs say `data`, the API says `brands`):
    // {"statusID":0,"brands":[{"id":1,"name":"MyBakuriani","authorized":0,...}]}
    const res = await fetch(`${UBILL_SMS_API}/brandNames`, {
      headers: { key },
      signal: AbortSignal.timeout(UBILL_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as {
      brands?: {
        id?: string | number;
        name?: string;
        authorized?: string | number;
      }[];
    } | null;
    if (!Array.isArray(body?.brands)) {
      console.warn("sms-dispatch: unexpected brandNames reply", {
        http: res.status,
        body: JSON.stringify(body).slice(0, 300),
      });
      return { id: fallback, source: "fallback_lookup_failed" };
    }
    const hit = body.brands.find((b) => b.name === name);
    if (hit && String(hit.authorized) === "1" && Number(hit.id) > 0) {
      return { id: Number(hit.id), source: "named" };
    }
    return { id: fallback, source: hit ? "fallback_pending_approval" : "fallback_not_found" };
  } catch {
    return { id: fallback, source: "fallback_lookup_failed" };
  }
}

// Settle submitted rows from uBill's report API (the only delivery source). uBill
// report statusIDs: 0 sent, 1 received, 2 not delivered, 3 awaiting, 4 error.
// Every answer, or the lack of one, is recorded (sms_record_provider_report: the
// row's history and provider_checked_at), and a row with no final report after 3
// days is closed even when the lookup itself keeps failing.
async function reconcileSubmitted(
  db: ReturnType<typeof createServiceClient>,
  key: string,
) {
  const now = Date.now();
  const { data: rows, error } = await db
    .from("sms_outbound")
    .select("provider_message_id, submitted_at")
    .eq("status", "submitted")
    .lt("submitted_at", new Date(now - POLL_AFTER_MS).toISOString())
    .or(
      `provider_checked_at.is.null,provider_checked_at.lt."${
        new Date(now - POLL_EVERY_MS).toISOString()
      }"`,
    )
    .order("provider_checked_at", { ascending: true, nullsFirst: true })
    .order("submitted_at", { ascending: true })
    .limit(RECONCILE_BATCH);
  if (error) throw error;

  let delivered = 0;
  let undelivered = 0;
  for (const row of rows ?? []) {
    const pid = row.provider_message_id as string;
    const status = await fetchUbillReportStatus(key, pid);
    const { error: recordErr } = await db.rpc("sms_record_provider_report", {
      p_provider_message_id: pid,
      p_report_status: status,
    });
    if (recordErr) {
      console.error("sms-dispatch: sms_record_provider_report failed", {
        code: recordErr.code,
        message: recordErr.message,
      });
    }
    const staleDays =
      (Date.now() - new Date(row.submitted_at as string).getTime()) /
      86_400_000;
    const payload = { provider: "ubill", report_status: status, via: "poll" };

    if (status === 1) {
      const { error: e } = await db.rpc("sms_mark_provider_delivered", {
        p_provider_message_id: pid,
        p_provider_response: payload,
      });
      if (!e) delivered++;
    } else if (status === 2 || status === 4 || staleDays > 3) {
      const { error: e } = await db.rpc("sms_mark_provider_undelivered", {
        p_provider_message_id: pid,
        p_provider_response:
          staleDays > 3 && status !== 2 && status !== 4
            ? { ...payload, expired: "no_final_report" }
            : payload,
      });
      if (!e) undelivered++;
    }
  }
  return { checked: rows?.length ?? 0, delivered, undelivered };
}
// ---------------------------------------------------------------------------

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    await requireSharedSecret(req);
    const db = createServiceClient();

    let priceDropMaterialization: unknown = null;
    const priceDropMode = (
      Deno.env.get("SMS_PRICE_DROP_MODE") ?? "off"
    ).toLowerCase();
    if (priceDropMode !== "off") {
      if (priceDropMode !== "on" && priceDropMode !== "qa") {
        throw new ApiError("Invalid SMS_PRICE_DROP_MODE", 500, "ENV_INVALID");
      }
      const siteUrl = Deno.env.get("SITE_URL");
      if (!siteUrl || !/^https?:\/\//.test(siteUrl)) {
        throw new ApiError(
          "SITE_URL is required for price-drop links",
          500,
          "ENV_MISSING",
        );
      }
      const { data, error: materializeError } = await db.rpc(
        "sms_materialize_due_price_drop_events",
        {
          p_site_url: siteUrl.replace(/\/+$/, ""),
          p_limit: 20,
          p_allowed_payers:
            priceDropMode === "qa"
              ? (Deno.env.get("SMS_QA_USER_IDS") ?? "")
                  .split(",")
                  .map((id) => id.trim())
                  .filter(Boolean)
              : null,
        },
      );
      if (materializeError) throw materializeError;
      priceDropMaterialization = data;
    }

    // 0. A row whose send started 15+ minutes ago and was never recorded may have
    //    gone out: fail it as unknown (never resent) before expiry names it stale.
    const { data: inDoubtRaw, error: inDoubtErr } = await db.rpc(
      "sms_fail_in_doubt_sends",
    );
    if (inDoubtErr) throw inDoubtErr;
    let inDoubt = Number(inDoubtRaw ?? 0);

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
    const { data: cancelledPriceRaw, error: cancelledPriceError } =
      await db.rpc("sms_cancel_ineligible_price_drop");
    if (cancelledPriceError) throw cancelledPriceError;
    const cancelledPriceDrop = Number(cancelledPriceRaw ?? 0);

    // Settle already-submitted rows even while sending is switched off, so a
    // disabled pipeline never strands a delivered message unbilled.
    const providerKey = Deno.env.get("SMS_PROVIDER_API_KEY");
    const reconciled = providerKey
      ? await reconcileSubmitted(db, providerKey)
      : null;

    // Fail closed: do not claim rows until delivery is deliberately enabled
    // and the provider is fully configured.
    const enabled =
      Deno.env.get("SMS_DELIVERY_ENABLED") === "true" && !!providerKey;
    const brand = enabled
      ? await resolveBrand(providerKey!)
      : { id: 0, source: "disabled" };
    const brandId = brand.id;
    if (!enabled || !Number.isInteger(brandId) || brandId <= 0) {
      return jsonResponse(
        {
          ok: true,
          delivery_enabled: false,
          reconciled,
          price_drop: priceDropMaterialization,
          in_doubt: inDoubt,
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

    const recipients = recipientPolicy(
      Deno.env.get("SMS_TEST_RECIPIENTS"),
      Deno.env.get("SUPABASE_URL"),
    );
    let halted = false;

    for (const row of rows) {
      const number = toUbillNumber(row.recipient_phone);
      let result: SendResult;
      if (halted) {
        result = { status: "skipped", providerResponse: {} };
      } else if (!number) {
        result = {
          status: "failed",
          providerResponse: { error: "invalid_number" },
        };
      } else if (!recipientAllowed(recipients, number)) {
        result = {
          status: "failed",
          providerResponse: { cancelled: "recipient_not_allowlisted" },
        };
      } else {
        // Stamp the row before calling uBill: a started row is never handed out
        // again, whatever happens next. No stamp, no send.
        const { data: started, error: startErr } = await db.rpc(
          "sms_mark_send_started",
          { p_sms_id: row.id, p_claim_token: claimToken },
        );
        if (startErr || started !== true) {
          console.error("sms-dispatch: send not started", {
            id: row.id,
            code: startErr?.code ?? "not_claimable",
          });
          if (startErr) {
            await db.rpc("sms_release_dispatch_claim", {
              p_claim_token: claimToken,
              p_sms_id: row.id,
            });
          }
          skipped++;
          continue;
        }
        result = await sendSms(number, row.message, providerKey!, brandId);
      }
      if (result.haltBatch) halted = true;

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
        const marked = await markSubmitted(
          db,
          row.id,
          claimToken,
          result.providerMessageId!,
          result.providerResponse,
        );
        if (!marked) {
          console.error("sms-dispatch: sent but not recorded", {
            id: row.id,
            smsID: result.providerMessageId,
          });
          inDoubt++;
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
        brand,
        reconciled,
        halted,
        price_drop: priceDropMaterialization,
        in_doubt: inDoubt,
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
