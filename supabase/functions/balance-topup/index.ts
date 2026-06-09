import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

type UserCtx = Awaited<ReturnType<typeof requireUser>>;

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
    const amount = Number(body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("არასწორი თანხა");
    }

    // Placeholder for TBC Bank payment integration.
    // In production: create a TBC payment session, redirect to TBC, and only
    // credit the balance after receiving a verified server-to-server callback.

    const { data, error } = await supabase.rpc("topup_balance", {
      p_user_id: user.id,
      p_amount: amount,
      p_description: null,
    });

    if (error) throw error;

    return jsonResponse(
      { data: { new_balance: data, amount_added: amount } },
      200,
      cors,
    );
  } catch (err) {
    // Best-effort failure notification. Skipped when auth itself failed
    // (no user/client). Swallow any insert error so the real error surfaces.
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
