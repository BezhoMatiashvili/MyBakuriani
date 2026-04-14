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

    // Verify admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      throw new Error("მხოლოდ ადმინისტრატორს აქვს წვდომა");
    }

    const { verification_id, status, admin_notes } = await req.json();

    if (!["approved", "rejected"].includes(status)) {
      throw new Error("არასწორი სტატუსი. გამოიყენეთ 'approved' ან 'rejected'");
    }

    // Fetch verification
    const { data: verification, error: verError } = await supabase
      .from("verifications")
      .select("*")
      .eq("id", verification_id)
      .single();

    if (verError || !verification) throw new Error("ვერიფიკაცია ვერ მოიძებნა");

    // Update verification
    const { error: updateError } = await supabase
      .from("verifications")
      .update({
        status,
        admin_notes: admin_notes || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", verification_id);

    if (updateError) throw updateError;

    // If approved and property_id exists, activate the property
    if (status === "approved" && verification.property_id) {
      await supabase
        .from("properties")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", verification.property_id);
    }

    // If approved, mark user as verified
    if (status === "approved") {
      await supabase
        .from("profiles")
        .update({ is_verified: true, verified_at: new Date().toISOString() })
        .eq("id", verification.user_id);
    }

    // Notify user
    await supabase.from("notifications").insert({
      user_id: verification.user_id,
      type: "verification",
      title:
        status === "approved"
          ? "ვერიფიკაცია დადასტურებულია"
          : "ვერიფიკაცია უარყოფილია",
      message:
        status === "approved"
          ? "თქვენი ვერიფიკაცია წარმატებით დასრულდა"
          : `ვერიფიკაცია უარყოფილია: ${admin_notes || ""}`,
      action_url: "/dashboard/verification",
    });

    return jsonResponse({ data: { verification_id, status } }, 200);
  } catch (err) {
    return errorResponse(err);
  }
});
