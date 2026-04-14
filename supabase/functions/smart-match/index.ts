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

    const {
      check_in,
      check_out,
      budget_min,
      budget_max,
      guests_count,
      preferences,
    } = await req.json();

    // Create the smart match request
    const { data: matchRequest, error: insertError } = await supabase
      .from("smart_match_requests")
      .insert({
        guest_id: user.id,
        check_in,
        check_out,
        budget_min,
        budget_max,
        guests_count,
        preferences,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Fetch active properties
    const { data: properties, error: propError } = await supabase
      .from("properties")
      .select("*, profiles!owner_id(display_name, rating)")
      .eq("status", "active");

    if (propError) throw propError;

    // Filter by date availability
    let available = properties || [];
    if (check_in && check_out) {
      const { data: blockedProps } = await supabase
        .from("calendar_blocks")
        .select("property_id")
        .in(
          "property_id",
          available.map((p: { id: string }) => p.id),
        )
        .gte("date", check_in)
        .lt("date", check_out)
        .in("status", ["booked", "blocked"]);

      const blockedIds = new Set(
        blockedProps?.map((b: { property_id: string }) => b.property_id) || [],
      );
      available = available.filter(
        (p: { id: string }) => !blockedIds.has(p.id),
      );
    }

    // Score each property
    const scored = available.map(
      (property: {
        id: string;
        price_per_night: number;
        capacity: number;
        amenities: string[];
        profiles: { rating: number };
      }) => {
        let score = 0;

        // Price match: 40% weight
        if (
          budget_min !== undefined &&
          budget_max !== undefined &&
          property.price_per_night
        ) {
          const midBudget = (budget_min + budget_max) / 2;
          const priceDiff =
            Math.abs(property.price_per_night - midBudget) / midBudget;
          score += Math.max(0, 1 - priceDiff) * 40;
        } else {
          score += 20; // neutral if no budget specified
        }

        // Date availability: 30% weight (already filtered, so full score)
        score += 30;

        // Amenity match: 20% weight
        if (preferences?.amenities && property.amenities) {
          const requested = preferences.amenities as string[];
          const available = property.amenities as string[];
          if (requested.length > 0) {
            const matched = requested.filter((a: string) =>
              available.includes(a),
            ).length;
            score += (matched / requested.length) * 20;
          } else {
            score += 10;
          }
        } else {
          score += 10;
        }

        // Rating: 10% weight
        const rating = property.profiles?.rating || 0;
        score += (rating / 5) * 10;

        return { ...property, match_score: Math.round(score) };
      },
    );

    // Sort by score descending, take top 10
    scored.sort(
      (a: { match_score: number }, b: { match_score: number }) =>
        b.match_score - a.match_score,
    );
    const topMatches = scored.slice(0, 10);
    const matchedIds = topMatches.map((p: { id: string }) => p.id);

    // Update match request with results
    await supabase
      .from("smart_match_requests")
      .update({ matched_properties: matchedIds, status: "matched" })
      .eq("id", matchRequest.id);

    // Notify property owners
    for (const property of topMatches) {
      await supabase.from("notifications").insert({
        user_id: property.owner_id,
        type: "smart_match",
        title: "ახალი Smart Match მოთხოვნა",
        message: `სტუმარი ეძებს საცხოვრებელს ${check_in || ""} - ${check_out || ""}`,
        action_url: `/dashboard/properties/${property.id}`,
      });
    }

    return jsonResponse({ data: topMatches, request_id: matchRequest.id }, 200);
  } catch (err) {
    return errorResponse(err);
  }
});
