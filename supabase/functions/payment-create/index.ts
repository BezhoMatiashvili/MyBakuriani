import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

type UserCtx = Awaited<ReturnType<typeof requireUser>>;

// Mirrors the topup_balance RPC cap so we reject early with a clear message.
const MAX_AMOUNT = 999999;

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  let ctx: UserCtx | undefined;

  try {
    ctx = await requireUser(req);
    const { supabase, user } = ctx;

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    const purpose = typeof body.purpose === "string" ? body.purpose : "topup";
    const returnPath =
      typeof body.return_path === "string" ? body.return_path : null;
    const referenceId =
      typeof body.reference_id === "string" ? body.reference_id : null;

    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      throw new Error("არასწორი თანხა");
    }

    // Only top-up is wired today. settle_payment also guards this, but reject
    // here so a bad client never even creates an unfulfillable session.
    if (purpose !== "topup") {
      throw new Error("გადახდის ტიპი არ არის მხარდაჭერილი");
    }

    const { data, error } = await supabase
      .from("payments")
      .insert({
        user_id: user.id,
        amount,
        purpose,
        reference_id: referenceId,
        return_path: returnPath,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) throw error;

    return jsonResponse({ data: { payment_id: data.id } }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
