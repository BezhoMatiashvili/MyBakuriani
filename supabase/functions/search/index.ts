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

    const {
      query,
      check_in,
      check_out,
      price_min,
      price_max,
      rooms,
      capacity,
      property_type,
      cadastral_code,
      lat,
      lng,
      page = 1,
      per_page = 20,
    } = await req.json();

    let dbQuery = supabase
      .from("properties")
      .select("*, profiles!owner_id(display_name, phone, avatar_url, rating)", {
        count: "exact",
      })
      .eq("status", "active");

    // Location trigram search
    if (query) {
      dbQuery = dbQuery.ilike("location", `%${query}%`);
    }

    // Filters
    if (price_min) dbQuery = dbQuery.gte("price_per_night", price_min);
    if (price_max) dbQuery = dbQuery.lte("price_per_night", price_max);
    if (rooms) dbQuery = dbQuery.gte("rooms", rooms);
    if (capacity) dbQuery = dbQuery.gte("capacity", capacity);
    if (property_type) dbQuery = dbQuery.eq("type", property_type);
    if (cadastral_code) dbQuery = dbQuery.eq("cadastral_code", cadastral_code);

    // Pagination
    const offset = (page - 1) * per_page;
    dbQuery = dbQuery.range(offset, offset + per_page - 1);

    // Ordering: super_vip first, then vip, then by created_at
    dbQuery = dbQuery
      .order("is_super_vip", { ascending: false })
      .order("is_vip", { ascending: false })
      .order("created_at", { ascending: false });

    const { data: properties, error, count } = await dbQuery;

    if (error) throw error;

    // Filter by date availability if dates provided
    let filtered = properties;
    if (check_in && check_out) {
      const { data: blockedProps } = await supabase
        .from("calendar_blocks")
        .select("property_id")
        .in("property_id", properties?.map((p: { id: string }) => p.id) || [])
        .gte("date", check_in)
        .lt("date", check_out)
        .in("status", ["booked", "blocked"]);

      const blockedIds = new Set(
        blockedProps?.map((b: { property_id: string }) => b.property_id) || [],
      );
      filtered =
        properties?.filter((p: { id: string }) => !blockedIds.has(p.id)) || [];
    }

    // Distance sorting if lat/lng provided
    if (lat && lng && filtered) {
      filtered.sort(
        (
          a: { location_lat: number; location_lng: number },
          b: { location_lat: number; location_lng: number },
        ) => {
          const distA = Math.sqrt(
            Math.pow((a.location_lat || 0) - lat, 2) +
              Math.pow((a.location_lng || 0) - lng, 2),
          );
          const distB = Math.sqrt(
            Math.pow((b.location_lat || 0) - lat, 2) +
              Math.pow((b.location_lng || 0) - lng, 2),
          );
          return distA - distB;
        },
      );
    }

    return new Response(
      JSON.stringify({
        data: filtered,
        total: count,
        page,
        per_page,
        total_pages: Math.ceil((count || 0) / per_page),
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
