import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

// This is deliberately an Edge-only setting.  Nothing exposed to the browser
// can turn sandbox payments on; production can stop new sandbox sessions by
// unsetting it or setting it to anything other than the literal string "true".
const testPaymentsEnabled = () => Deno.env.get("TEST_PAYMENTS_ENABLED") === "true";
const MAX_AMOUNT = 999999;

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { supabase, user } = await requireUser(req);
    if (!testPaymentsEnabled()) {
      return jsonResponse(
        { error: "Test payments are disabled", code: "TEST_PAYMENTS_DISABLED" },
        503,
        cors,
      );
    }
    const body = await req.json().catch(() => ({}));
    const amount = body.amount;
    const purpose = body.purpose ?? "topup";
    const returnPath = body.return_path;

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount < 1 ||
      amount > MAX_AMOUNT ||
      Math.round(amount * 100) !== amount * 100
    ) {
      return jsonResponse(
        { error: "Amount must be between 1 and 999999 GEL", code: "BAD_REQUEST" },
        400,
        cors,
      );
    }

    if (purpose !== "topup") {
      return jsonResponse(
        { error: "Unsupported payment purpose", code: "BAD_REQUEST" },
        400,
        cors,
      );
    }

    // The checkout client also validates this before navigating. Keeping only
    // a local path in the ledger prevents an injected return URL from becoming
    // an open redirect if another client consumes it in the future.
    const safeReturnPath =
      typeof returnPath === "string" && /^\/(?!\/)/.test(returnPath)
        ? returnPath
        : null;

    const { data, error } = await supabase
      .from("payments")
      .insert({
        user_id: user.id,
        amount,
        purpose,
        return_path: safeReturnPath,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) throw error;
    return jsonResponse({ data: { payment_id: data.id } }, 200, cors);
  } catch (error) {
    return errorResponse(error, cors);
  }
});
