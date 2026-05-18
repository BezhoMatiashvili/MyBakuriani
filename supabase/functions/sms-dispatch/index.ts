// SMS dispatch — STUB.
//
// Picks up rows in `sms_outbound` with status='approved' and (in production)
// hands them to an SMS provider (smsoffice.ge / Twilio / etc.), then updates
// the row to 'sent' on success or 'failed' on a provider error.
//
// Until a provider is wired in, this function is intentionally inert: it
// returns the rows that *would* be sent, without calling any external API.
// Hook this up to a cron / scheduled trigger once the provider integration
// lands.
//
// Provider integration TODO (smsoffice.ge):
//   POST https://api.smsoffice.ge/api/v2/send/
//     content: { content, destination: phone, sender: brand, ... }
//   Auth via `SMS_PROVIDER_API_KEY` env var.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  createServiceClient,
  errorResponse,
  jsonResponse,
} from "../_shared/guards.ts";

const BATCH_SIZE = 25;

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const db = createServiceClient();

    const { data: approved, error } = await db
      .from("sms_outbound")
      .select("id, recipient_phone, message")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;

    // TODO: replace this loop with a real provider call.
    // For each row: POST to SMS provider, then update status to 'sent' (with
    // provider_response + sent_at) or 'failed'.
    const queued = (approved ?? []).map((row) => row.id);

    return jsonResponse(
      {
        ok: true,
        queued_count: queued.length,
        ids: queued,
        note: "Provider integration not yet wired. Rows remain in 'approved' state.",
      },
      200,
      cors,
    );
  } catch (err) {
    return errorResponse(err, cors);
  }
});
