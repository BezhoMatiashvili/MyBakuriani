import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

type UserCtx = Awaited<ReturnType<typeof requireUser>>;

// --- Dummy gateway decision table (server-side source of truth) -------------
// Keep in sync with src/lib/payments/test-cards.ts (client display only).
const APPROVE_CARD = "4242424242424242";
const DECLINE_CARDS: Record<string, string> = {
  "4000000000000002": "ბარათი უარყოფილია",
  "4000000000009995": "არასაკმარისი თანხა ბარათზე",
};

function detectBrand(num: string): string {
  if (num.startsWith("4")) return "Visa";
  if (/^5[1-5]/.test(num) || /^2[2-7]/.test(num)) return "Mastercard";
  return "Card";
}

/** True when the card is not yet expired (valid through the end of exp month). */
function notExpired(expMonth: number, expYear: number): boolean {
  const fullYear = expYear < 100 ? 2000 + expYear : expYear;
  const firstDayAfter = new Date(fullYear, expMonth, 1); // expMonth is 1-based
  return firstDayAfter > new Date();
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  // Hoisted so the catch block can notify the user of a failed payment.
  let ctx: UserCtx | undefined;

  try {
    ctx = await requireUser(req);
    const { supabase, user } = ctx;

    const body = await req.json().catch(() => ({}));
    const paymentId =
      typeof body.payment_id === "string" ? body.payment_id : "";
    const cancel = body.cancel === true;

    if (!paymentId) {
      throw new Error("არასწორი გადახდა");
    }

    // --- Cancel path: mark a pending session cancelled and return. ---
    if (cancel) {
      await supabase
        .from("payments")
        .update({
          status: "cancelled",
          completed_at: new Date().toISOString(),
        })
        .eq("id", paymentId)
        .eq("user_id", user.id)
        .eq("status", "pending");
      return jsonResponse({ data: { status: "cancelled" } }, 200, cors);
    }

    const cardNumber = String(body.card_number ?? "").replace(/\D/g, "");
    const expMonth = Number(body.exp_month);
    const expYear = Number(body.exp_year);
    const cvc = String(body.cvc ?? "").replace(/\D/g, "");

    // --- Dummy gateway decision (server-side) ---
    const shapeOk =
      cardNumber.length === 16 &&
      Number.isInteger(expMonth) &&
      expMonth >= 1 &&
      expMonth <= 12 &&
      Number.isInteger(expYear) &&
      cvc.length === 3;

    let approved = false;
    let declineMsg: string | null = null;

    if (!shapeOk) {
      declineMsg = "ბარათის მონაცემები არასწორია";
    } else if (!notExpired(expMonth, expYear)) {
      declineMsg = "ბარათს ვადა გაუვიდა";
    } else if (cardNumber === APPROVE_CARD) {
      approved = true;
    } else if (DECLINE_CARDS[cardNumber]) {
      declineMsg = DECLINE_CARDS[cardNumber];
    } else {
      declineMsg = "გამოიყენეთ სატესტო ბარათი";
    }

    const brand = shapeOk ? detectBrand(cardNumber) : null;
    const last4 = cardNumber.length >= 4 ? cardNumber.slice(-4) : null;

    const { data, error } = await supabase.rpc("settle_payment", {
      p_payment_id: paymentId,
      p_user_id: user.id,
      p_approved: approved,
      p_card_brand: brand,
      p_card_last4: last4,
      p_error: declineMsg,
    });

    if (error) throw error;

    const result = data as {
      status: string;
      new_balance?: number;
      already_processed?: boolean;
    };

    if (result.status === "succeeded") {
      return jsonResponse(
        { data: { status: "succeeded", new_balance: result.new_balance } },
        200,
        cors,
      );
    }

    // A re-submit landing on a session that is no longer pending (e.g. it was
    // cancelled in another tab). The card may be fine — give a clear reason
    // instead of the generic decline string.
    if (result.already_processed) {
      return jsonResponse(
        {
          data: {
            status: "declined",
            message: "ეს გადახდის სესია აღარ არის აქტიური",
          },
        },
        200,
        cors,
      );
    }

    // Declined card.
    return jsonResponse(
      {
        data: {
          status: "declined",
          message: declineMsg ?? "გადახდა ვერ შესრულდა",
        },
      },
      200,
      cors,
    );
  } catch (err) {
    // Best-effort failure notification (real errors only — not card declines,
    // which return a 200 above). Swallow insert errors so the real error wins.
    if (ctx?.user?.id) {
      try {
        await ctx.supabase.from("notifications").insert({
          user_id: ctx.user.id,
          type: "payment_failed",
          title: "გადახდა ვერ შესრულდა",
          message: err instanceof Error ? err.message : "სცადეთ თავიდან.",
          action_url: "/dashboard",
          severity: "warning",
        });
      } catch (_) {
        // ignore
      }
    }
    return errorResponse(err, cors);
  }
});
