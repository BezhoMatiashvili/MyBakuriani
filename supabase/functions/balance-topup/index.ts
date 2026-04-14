import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { supabase, user } = await requireUser(req);

    const { amount } = await req.json();

    if (!amount || amount <= 0) {
      throw new Error("არასწორი თანხა");
    }

    // Placeholder for TBC Bank payment integration
    // In production, this would:
    // 1. Create a TBC payment session
    // 2. Redirect user to TBC payment page
    // 3. Handle callback to confirm payment
    // For now, we simulate a successful topup

    // Create transaction record
    const { error: txError } = await supabase.from("transactions").insert({
      user_id: user.id,
      amount,
      type: "topup",
      description: `ბალანსის შევსება: ${amount} ₾`,
    });

    if (txError) throw txError;

    // Update balance
    const { data: balance, error: balError } = await supabase
      .from("balances")
      .select("amount")
      .eq("user_id", user.id)
      .single();

    if (balError) throw balError;

    const newAmount = (balance?.amount || 0) + amount;

    const { error: updateError } = await supabase
      .from("balances")
      .update({ amount: newAmount, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (updateError) throw updateError;

    return jsonResponse(
      {
        data: { new_balance: newAmount, amount_added: amount },
      },
      200,
    );
  } catch (err) {
    return errorResponse(err);
  }
});
