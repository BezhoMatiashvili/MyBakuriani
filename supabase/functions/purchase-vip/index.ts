import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Pricing
const PRICING = {
  vip_boost: { cost: 1.5, duration_hours: 24, description: "VIP გამოკვეთა" },
  super_vip: { cost: 5.0, duration_hours: 24, description: "Super VIP" },
  sms_package: {
    cost: 10.0,
    sms_count: 200,
    description: "SMS პაკეტი (200 SMS)",
  },
  discount_badge: {
    cost: 1.0,
    duration_hours: 24,
    description: "ფასდაკლების ბეჯი",
  },
} as const;

type PurchaseType = keyof typeof PRICING;

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

    const { purchase_type, property_id, days = 1 } = await req.json();

    if (!PRICING[purchase_type as PurchaseType]) {
      throw new Error("არასწორი შეძენის ტიპი");
    }

    const pricing = PRICING[purchase_type as PurchaseType];
    const totalCost = pricing.cost * days;

    // Check balance
    const { data: balance, error: balError } = await supabase
      .from("balances")
      .select("amount, sms_remaining")
      .eq("user_id", user.id)
      .single();

    if (balError) throw balError;
    if (!balance || balance.amount < totalCost) {
      throw new Error(
        `არასაკმარისი ბალანსი. საჭიროა: ${totalCost} ₾, ხელმისაწვდომია: ${balance?.amount || 0} ₾`,
      );
    }

    // Deduct from balance
    const newBalance = balance.amount - totalCost;
    await supabase
      .from("balances")
      .update({
        amount: newBalance,
        ...(purchase_type === "sms_package"
          ? {
              sms_remaining:
                (balance.sms_remaining || 0) +
                (pricing as { sms_count: number }).sms_count,
            }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    // Create transaction
    await supabase.from("transactions").insert({
      user_id: user.id,
      amount: -totalCost,
      type: purchase_type,
      description: `${pricing.description} (${days} დღე)`,
      reference_id: property_id || null,
    });

    // Apply VIP flags to property if applicable
    if (
      property_id &&
      (purchase_type === "vip_boost" || purchase_type === "super_vip")
    ) {
      const expiresAt = new Date();
      expiresAt.setHours(
        expiresAt.getHours() +
          (pricing as { duration_hours: number }).duration_hours * days,
      );

      await supabase
        .from("properties")
        .update({
          ...(purchase_type === "vip_boost"
            ? { is_vip: true }
            : { is_super_vip: true }),
          vip_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", property_id)
        .eq("owner_id", user.id);
    }

    // Apply discount badge to property
    if (property_id && purchase_type === "discount_badge") {
      await supabase
        .from("properties")
        .update({
          discount_percent: 10, // default discount badge percentage
          updated_at: new Date().toISOString(),
        })
        .eq("id", property_id)
        .eq("owner_id", user.id);
    }

    return new Response(
      JSON.stringify({
        data: {
          purchase_type,
          cost: totalCost,
          new_balance: newBalance,
          ...(purchase_type === "sms_package"
            ? {
                sms_remaining:
                  (balance.sms_remaining || 0) +
                  (pricing as { sms_count: number }).sms_count,
              }
            : {}),
        },
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
