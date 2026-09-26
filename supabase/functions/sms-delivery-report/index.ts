// uBill.ge delivery-report webhook (C18).
//
// uBill sends a GET per status change:
//   ?key=<callback key>&event=sms.delivery.updated&smsID=..&number=..&statusID=..&date=..
// statusID: 0 sent, 1 received, 2 not delivered, 3 awaiting, 4 error.
//
// Auth: the `key` query param must equal SMS_PROVIDER_CALLBACK_KEY (the value
// entered in the uBill API settings). Deployed verify_jwt=false — uBill sends no JWT.
// After auth, always answer 2xx (unknown / duplicate ids included) so uBill has
// nothing to retry; sms-dispatch's poll settles anything this misses.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  ApiError,
  createServiceClient,
  errorResponse,
  jsonResponse,
} from "../_shared/guards.ts";
import { secretsEqual } from "../_shared/secrets.ts";

serve(async (req) => {
  try {
    const expected = Deno.env.get("SMS_PROVIDER_CALLBACK_KEY");
    if (!expected) {
      throw new ApiError(
        "SMS_PROVIDER_CALLBACK_KEY is not configured",
        500,
        "ENV_MISSING",
      );
    }

    const url = new URL(req.url);
    const params =
      req.method === "POST"
        ? new URLSearchParams(await req.text())
        : url.searchParams;
    const get = (name: string) =>
      params.get(name) ?? url.searchParams.get(name) ?? "";

    if (!(await secretsEqual(get("key"), expected))) {
      throw new ApiError("Invalid callback key", 401, "AUTH_UNAUTHORIZED");
    }

    const smsId = get("smsID").trim();
    const status = Number(get("statusID"));
    if (!smsId) return jsonResponse({ ok: true, ignored: "no_sms_id" }, 200, {});

    const payload = {
      provider: "ubill",
      report_status: status,
      reported_at: get("date") || null,
      via: "webhook",
    };

    let rpc: string | null = null;
    if (status === 1) rpc = "sms_mark_provider_delivered";
    else if (status === 2 || status === 4)
      rpc = "sms_mark_provider_undelivered";
    if (!rpc) return jsonResponse({ ok: true, ignored: "not_final" }, 200, {});

    const db = createServiceClient();
    const { data, error } = await db.rpc(rpc, {
      p_provider_message_id: smsId,
      p_provider_response: payload,
    });
    if (error) {
      // P0002 = unknown id, 22023 = row no longer 'submitted'. Neither is retryable.
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
