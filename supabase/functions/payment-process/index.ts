import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

const testPaymentsEnabled = () => Deno.env.get("TEST_PAYMENTS_ENABLED") === "true";

// Server-side source of truth for the sandbox. These are test numbers only;
// this function never calls a PSP.
const APPROVE_CARD = "4242424242424242";
const CARD_RESULTS: Record<string, "declined" | "insufficient"> = {
  "4000000000000002": "declined",
  "4000000000009995": "insufficient",
};

function detectBrand(number: string): string {
  if (number.startsWith("4")) return "Visa";
  if (/^5[1-5]/.test(number) || /^2[2-7]/.test(number)) return "Mastercard";
  return "Card";
}

function notExpired(expMonth: number, expYear: number): boolean {
  const fullYear = expYear < 100 ? 2000 + expYear : expYear;
  return new Date(fullYear, expMonth, 1) > new Date();
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { supabase, user } = await requireUser(req);
    // Do not log this body. PAN, expiry and CVC are used only in memory to
    // select the sandbox result and are never written to the database.
    const body = await req.json().catch(() => ({}));
    const paymentId = typeof body.payment_id === "string" ? body.payment_id : "";
    const cancel = body.cancel === true;

    if (!paymentId) {
      return jsonResponse({ error: "Invalid payment", code: "BAD_REQUEST" }, 400, cors);
    }

    // Check ownership before either cancellation or settlement. The service
    // client intentionally bypasses RLS for writes, so this is required in
    // addition to the checkout page's owner-scoped RLS read.
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, status")
      .eq("id", paymentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) {
      return jsonResponse({ error: "Payment not found", code: "PAYMENT_NOT_FOUND" }, 404, cors);
    }

    // Cancellation is intentionally available even after the kill switch is
    // turned off, but only for this user's still-pending session.
    if (cancel) {
      if (payment.status !== "pending") {
        return jsonResponse(
          { data: { status: payment.status, already_processed: true } },
          200,
          cors,
        );
      }
      const { error } = await supabase
        .from("payments")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .eq("id", paymentId)
        .eq("user_id", user.id)
        .eq("status", "pending");
      if (error) throw error;
      return jsonResponse({ data: { status: "cancelled" } }, 200, cors);
    }

    if (!testPaymentsEnabled()) {
      return jsonResponse(
        { error: "Test payments are disabled", code: "TEST_PAYMENTS_DISABLED" },
        503,
        cors,
      );
    }

    const cardNumber = String(body.card_number ?? "").replace(/\D/g, "");
    const expMonth = Number(body.exp_month);
    const expYear = Number(body.exp_year);
    const cvc = String(body.cvc ?? "").replace(/\D/g, "");
    const shapeOk =
      cardNumber.length === 16 &&
      Number.isInteger(expMonth) &&
      expMonth >= 1 &&
      expMonth <= 12 &&
      Number.isInteger(expYear) &&
      cvc.length === 3;

    let approved = false;
    let reason: string;
    if (!shapeOk) {
      reason = "invalid_card";
    } else if (!notExpired(expMonth, expYear)) {
      reason = "expired_card";
    } else if (cardNumber === APPROVE_CARD) {
      approved = true;
      reason = "";
    } else {
      reason = CARD_RESULTS[cardNumber] ?? "test_card_required";
    }

    // Persist only non-sensitive card metadata. Neither PAN, expiry nor CVC
    // is included in an error, a log, the RPC parameters, or a ledger field.
    const { data, error } = await supabase.rpc("settle_payment", {
      p_payment_id: paymentId,
      p_user_id: user.id,
      p_approved: approved,
      p_card_brand: shapeOk ? detectBrand(cardNumber) : null,
      p_card_last4: cardNumber.length >= 4 ? cardNumber.slice(-4) : null,
      p_error: reason || null,
    });
    if (error) throw error;

    const result = data as {
      status: "pending" | "succeeded" | "declined" | "cancelled";
      new_balance?: number;
      already_processed?: boolean;
    };
    if (result.status === "succeeded") {
      return jsonResponse(
        {
          data: {
            status: "succeeded",
            new_balance: result.new_balance,
            already_processed: result.already_processed === true,
          },
        },
        200,
        cors,
      );
    }
    if (result.already_processed) {
      return jsonResponse(
        { data: { status: result.status, reason: "session_inactive" } },
        200,
        cors,
      );
    }
    return jsonResponse({ data: { status: "declined", reason } }, 200, cors);
  } catch (error) {
    return errorResponse(error, cors);
  }
});
