import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization")!;
    const {
      data: { user },
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) throw new Error("Unauthorized");

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

    return new Response(
      JSON.stringify({
        data: { new_balance: newAmount, amount_added: amount },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
