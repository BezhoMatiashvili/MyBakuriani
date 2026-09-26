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
// Provider: uBill.ge (api.ubill.dev). `sendSms()` is the SINGLE send integration point.
// uBill's delivery webhook (sms-delivery-report) only prompts a status check; both
// it and the reconcileSubmitted() poll below settle rows from uBill's report API.
// SMS_DELIVERY_ENABLED is an independent fail-closed switch checked before claiming.
// SMS_TEST_RECIPIENTS (comma-separated numbers), when set, restricts sending to those
// numbers and fails every other row — staging keeps it set permanently.
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
  UBILL_SMS_API,
  UBILL_TIMEOUT_MS,
} from "../_shared/ubill.ts";

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
  // Account-level problem (no credit, brand not approved, bad key, outage):
  // release this row and every remaining row in the batch, and stop sending.
  haltBatch?: boolean;
};

const RECONCILE_BATCH = 25;

// uBill send statusIDs. 0 = accepted. Everything else is an error; only the
// "no valid number" family is the row's fault.
const UBILL_ROW_ERRORS = new Set([20, 50]);

// Same rule as sms_canonical_ge_phone: exactly a 9-digit mobile, optionally
// prefixed by 995. Never truncate extra digits.
function toUbillNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (/^5\d{8}$/.test(digits)) return `995${digits}`;
  if (/^9955\d{8}$/.test(digits)) return digits;
  return null;
}

function testRecipients(): Set<string> | null {
  const raw = Deno.env.get("SMS_TEST_RECIPIENTS")?.trim();
  if (!raw) return null;
  return new Set(
    raw
      .split(",")
      .map((n) => toUbillNumber(n))
      .filter((n): n is string => !!n),
  );
}

// --- Provider adapter — the only place that sends through the gateway. -------
// uBill has no idempotency key. At-least-once risk is limited to a crash between
// an accepted send and sms_mark_claim_submitted; a network error or timeout is
// treated as 'failed' (not retried) so an ambiguous send is never repeated.
async function sendSms(
  _smsId: string,
  phone: string,
  message: string,
  key: string,
  brandId: number,
  allowlist: Set<string> | null,
): Promise<SendResult> {
  const number = toUbillNumber(phone);
  if (!number) {
    return { status: "failed", providerResponse: { error: "invalid_number" } };
  }
  if (allowlist && !allowlist.has(number)) {
    return {
      status: "failed",
      providerResponse: { cancelled: "recipient_not_allowlisted" },
    };
  }

  let res: Response;
  try {
    res = await fetch(`${UBILL_SMS_API}/send`, {
      method: "POST",
      headers: { key, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandID: brandId,
        numbers: [Number(number)],
        text: message,
        stopList: true,
      }),
      signal: AbortSignal.timeout(UBILL_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      status: "failed",
      providerResponse: { error: "network", detail: String(err).slice(0, 200) },
    };
  }

  const body = (await res.json().catch(() => null)) as {
    statusID?: number;
    smsID?: number | string;
    message?: string;
  } | null;
  const statusId = Number(body?.statusID);
  const providerResponse = {
    provider: "ubill",
    http: res.status,
    statusID: body?.statusID ?? null,
    smsID: body?.smsID ?? null,
    message: body?.message ?? null,
  };

  if (res.ok && statusId === 0 && body?.smsID != null) {
    return {
      status: "submitted",
      providerMessageId: String(body.smsID),
      providerResponse,
    };
  }
  if (res.ok && UBILL_ROW_ERRORS.has(statusId)) {
    return { status: "failed", providerResponse };
  }
  console.error("sms-dispatch: provider refused batch", providerResponse);
  return { status: "skipped", providerResponse, haltBatch: true };
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

// Settle submitted rows whose delivery webhook never arrived. uBill report
// statusIDs: 0 sent, 1 received, 2 not delivered, 3 awaiting, 4 error.
async function reconcileSubmitted(
  db: ReturnType<typeof createServiceClient>,
  key: string,
) {
  const { data: rows, error } = await db
    .from("sms_outbound")
    .select("provider_message_id, submitted_at")
    .eq("status", "submitted")
    .lt("submitted_at", new Date(Date.now() - 15 * 60_000).toISOString())
    .order("submitted_at", { ascending: true })
    .limit(RECONCILE_BATCH);
  if (error) throw error;

  let delivered = 0;
  let undelivered = 0;
  for (const row of rows ?? []) {
    const pid = row.provider_message_id as string;
    const status = await fetchUbillReportStatus(key, pid);
    if (status === null) continue;
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

    const allowlist = testRecipients();
    let halted = false;

    for (const row of rows) {
      const result = halted
        ? ({ status: "skipped", providerResponse: {} } as SendResult)
        : await sendSms(
            row.id,
            row.recipient_phone,
            row.message,
            providerKey!,
            brandId,
            allowlist,
          );
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
        if (!result.providerMessageId) {
          throw new Error(`Provider accepted ${row.id} without a message id`);
        }
        const { error: markErr } = await db.rpc("sms_mark_claim_submitted", {
          p_sms_id: row.id,
          p_claim_token: claimToken,
          p_provider_message_id: result.providerMessageId,
          p_provider_response: result.providerResponse ?? {},
        });
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
        brand,
        reconciled,
        halted,
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
