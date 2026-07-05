import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

// Georgian property-type labels + public-detail URL — inlined because Deno edge
// functions can't import from src/lib. Mirror of src/lib/notifications/
// listing-labels.ts and src/lib/utils/listingUrls.ts.
const PROPERTY_TYPE_LABEL_KA: Record<string, string> = {
  apartment: "აპარტამენტი",
  studio: "სტუდიო",
  cottage: "კოტეჯი",
  hotel: "სასტუმრო ოთახი",
  villa: "ვილა",
};

function propertyViewUrl(p: {
  id: string;
  type?: string | null;
  is_for_sale?: boolean | null;
}): string {
  if (p.is_for_sale) return `/sales/${p.id}`;
  if (p.type === "hotel") return `/hotels/${p.id}`;
  return `/apartments/${p.id}`;
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
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

    // Look up the verified property (if any) so the notification names it.
    let property: {
      title: string | null;
      type: string | null;
      is_for_sale: boolean | null;
    } | null = null;
    if (verification.property_id) {
      const { data } = await supabase
        .from("properties")
        .select("title, type, is_for_sale")
        .eq("id", verification.property_id)
        .maybeSingle();
      property = data;
    }

    const notes = (admin_notes || "").trim();
    const approved = status === "approved";
    let message: string;
    let action_url = "/dashboard";
    if (property) {
      const name =
        property.title?.trim() ||
        PROPERTY_TYPE_LABEL_KA[property.type ?? ""] ||
        "ობიექტი";
      message = approved
        ? `თქვენი ობიექტი „${name}" ვერიფიცირებულია.`
        : `ობიექტის „${name}" ვერიფიკაცია უარყოფილია.${
            notes ? ` მიზეზი: ${notes}` : ""
          }`;
      if (approved) {
        action_url = propertyViewUrl({
          id: verification.property_id,
          type: property.type,
          is_for_sale: property.is_for_sale,
        });
      }
    } else {
      message = approved
        ? "თქვენი ვერიფიკაცია წარმატებით დასრულდა."
        : `თქვენი ვერიფიკაცია უარყოფილია.${notes ? ` მიზეზი: ${notes}` : ""}`;
    }

    // Notify user
    await supabase.from("notifications").insert({
      user_id: verification.user_id,
      type: "verification",
      title: approved
        ? "თქვენი ვერიფიკაცია დამტკიცდა"
        : "თქვენი ვერიფიკაცია უარყოფილია",
      message,
      action_url,
    });

    return jsonResponse({ data: { verification_id, status } }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
