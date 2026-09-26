// uBill.ge delivery-report webhook (C18).
//
// uBill sends a GET per status change:
//   ?key=..&event=sms.delivery.updated&smsID=..&number=..&statusID=..&date=..
//
// Nothing in that request is trusted. uBill's "Callback key" field cannot be
// edited once set and truncates to 30 characters, so it is not used as auth.
// The webhook is only a prompt: for a message we actually submitted, it asks
// uBill's report API for the status with our own API key and settles the row
// from that answer (same "only trust a status we requested" rule as C32).
// A forged call can at most trigger one extra report lookup for our own row.
// Deployed verify_jwt=false — uBill sends no JWT. sms-dispatch's poll settles
// anything this misses.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  ApiError,
  createServiceClient,
  errorResponse,
  jsonResponse,
} from "../_shared/guards.ts";
import { fetchUbillReportStatus } from "../_shared/ubill.ts";

serve(async (req) => {
  try {
    const key = Deno.env.get("SMS_PROVIDER_API_KEY");
    if (!key) {
      throw new ApiError(
        "SMS_PROVIDER_API_KEY is not configured",
        500,
        "ENV_MISSING",
      );
    }

    const url = new URL(req.url);
    const params =
      req.method === "POST"
        ? new URLSearchParams(await req.text())
        : url.searchParams;
    const smsId = (params.get("smsID") ?? url.searchParams.get("smsID") ?? "")
      .trim();
    if (!/^\d{1,20}$/.test(smsId)) {
      return jsonResponse({ ok: true, ignored: "no_sms_id" }, 200, {});
    }

    const db = createServiceClient();
    const { data: row, error: lookupError } = await db
      .from("sms_outbound")
      .select("id")
      .eq("provider_message_id", smsId)
      .eq("status", "submitted")
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!row) return jsonResponse({ ok: true, ignored: "not_pending" }, 200, {});

    const status = await fetchUbillReportStatus(key, smsId);
    let rpc: string | null = null;
    if (status === 1) rpc = "sms_mark_provider_delivered";
    else if (status === 2 || status === 4) rpc = "sms_mark_provider_undelivered";
    if (!rpc) {
      return jsonResponse({ ok: true, ignored: "not_final", status }, 200, {});
    }

    const { data, error } = await db.rpc(rpc, {
      p_provider_message_id: smsId,
      p_provider_response: {
        provider: "ubill",
        report_status: status,
        via: "webhook",
      },
    });
    if (error) {
      console.warn("sms-delivery-report: not applied", {
        smsId,
        status,
        code: error.code,
      });
      return jsonResponse({ ok: true, ignored: error.code ?? "error" }, 200, {});
    }
    return jsonResponse({ ok: true, result: data }, 200, {});
  } catch (err) {
    return errorResponse(err, {});
  }
});
