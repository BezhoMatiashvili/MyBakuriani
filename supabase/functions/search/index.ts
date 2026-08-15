import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  checkRateLimit,
  createServiceClient,
  ApiError,
  errorResponse,
  jsonResponse,
} from "../_shared/guards.ts";
import { sanitizeQuery } from "../_shared/sanitize.ts";

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!(await checkRateLimit(req, "search", 30, 60_000))) {
    return jsonResponse(
      { error: "rate_limited", code: "RATE_LIMITED" },
      429,
      corsHeaders,
    );
  }

  try {
    const supabase = createServiceClient();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError("A JSON object is required", 400, "BAD_REQUEST");
    }

    const {
      q,
      entity_types,
      query,
      check_in,
      check_out,
      price_min,
      price_max,
      rooms,
      bathrooms,
      capacity,
      property_type,
      property_types,
      cadastral_code,
      is_for_sale,
      amenities,
      area_min,
      area_max,
      verified_only,
      roi_min,
      construction_status,
      renovation_status,
      lat,
      lng,
      page: requestedPage = 1,
      per_page: requestedPerPage = 20,
    } = body as Record<string, unknown>;

    // Bound page size for this unauthenticated endpoint.  It reads only the
    // explicit public views below; contact and owner fields never enter its
    // response regardless of a future base-table column addition.
    const per_page = Math.min(Math.max(1, Number(requestedPerPage) || 20), 100);
    const page = Math.min(
      Math.max(1, Math.trunc(Number(requestedPage)) || 1),
      1_000,
    );
    const normalizedQuery = typeof query === "string"
      ? query.trim().slice(0, 200)
      : "";
    const latitude = typeof lat === "number" && Number.isFinite(lat) &&
        lat >= -90 && lat <= 90
      ? lat
      : null;
    const longitude = typeof lng === "number" && Number.isFinite(lng) &&
        lng >= -180 && lng <= 180
      ? lng
      : null;

    // Global keyword search path: when `q` is set, fan out across
    // properties + services + blog_posts via the global_search RPC and
    // return a bucketed payload. Property-specific filters apply only to the
    // property bucket; services and blog results retain the broad global
    // search behavior.
    const trimmedQ = typeof q === "string" ? q.trim().slice(0, 200) : "";
    if (trimmedQ.length > 0) {
      const types = Array.isArray(entity_types) && entity_types.length > 0
        ? entity_types
        : ["properties", "services", "blog_posts"];

      const { data: hits, error: rpcError } = await supabase.rpc(
        "global_search",
        {
          q: trimmedQ,
          entity_types: types,
          result_limit: 120,
        },
      );

      if (rpcError) throw rpcError;

      type Hit = {
        entity_type: "properties" | "services" | "blog_posts";
        entity_id: string;
        title: string;
        snippet: string;
        slug: string;
        photo: string;
        sim: number;
        payload: Record<string, unknown>;
      };

      const rows = (hits ?? []) as Hit[];
      const propertyIds = rows.filter((r) => r.entity_type === "properties")
        .map((r) => r.entity_id);
      const serviceIds = rows.filter((r) => r.entity_type === "services").map((
        r,
      ) => r.entity_id);
      const fetchProperties = async () => {
        if (propertyIds.length === 0) return [];

        let propertyQuery = supabase
          .from("public_properties")
          .select("*")
          .in("id", propertyIds);

        if (normalizedQuery) {
          const safeQuery = sanitizeQuery(normalizedQuery);
          propertyQuery = propertyQuery.or(
            `location.ilike.%${safeQuery}%,title.ilike.%${safeQuery}%`,
          );
        }
        if (is_for_sale !== undefined && is_for_sale !== null) {
          propertyQuery = propertyQuery.eq("is_for_sale", is_for_sale);
        }
        if (is_for_sale) {
          if (price_min) {
            propertyQuery = propertyQuery.gte("sale_price", price_min);
          }
          if (price_max) {
            propertyQuery = propertyQuery.lte("sale_price", price_max);
          }
        } else {
          if (price_min) {
            propertyQuery = propertyQuery.gte("price_per_night", price_min);
          }
          if (price_max) {
            propertyQuery = propertyQuery.lte("price_per_night", price_max);
          }
        }
        if (rooms) propertyQuery = propertyQuery.gte("rooms", rooms);
        if (bathrooms) {
          propertyQuery = propertyQuery.gte("bathrooms", bathrooms);
        }
        if (capacity) propertyQuery = propertyQuery.gte("capacity", capacity);
        if (property_type) {
          propertyQuery = propertyQuery.eq("type", property_type);
        }
        if (Array.isArray(property_types) && property_types.length > 0) {
          propertyQuery = propertyQuery.in("type", property_types);
        }
        if (area_min) propertyQuery = propertyQuery.gte("area_sqm", area_min);
        if (area_max) propertyQuery = propertyQuery.lte("area_sqm", area_max);
        if (verified_only) {
          propertyQuery = propertyQuery.eq("profile_is_verified", true);
        }
        if (Array.isArray(amenities)) {
          for (const amenity of amenities) {
            propertyQuery = propertyQuery.contains("amenities", [amenity]);
          }
        }

        const { data, error } = await propertyQuery;
        if (error) throw error;
        let filtered = data ?? [];

        if (check_in && check_out && filtered.length > 0) {
          const { data: blockedProps } = await supabase
            .from("calendar_blocks")
            .select("property_id")
            .in("property_id", filtered.map((property) => property.id))
            .gte("date", check_in)
            .lt("date", check_out)
            .in("status", ["booked", "blocked"]);
          const blockedIds = new Set(
            blockedProps?.map((block) => block.property_id) ?? [],
          );
          filtered = filtered.filter((property) =>
            !blockedIds.has(property.id)
          );
        }

        const rank = new Map(propertyIds.map((id, index) => [id, index]));
        return filtered.sort(
          (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
        );
      };

      const [propertiesArr, { data: servicesArr }] = await Promise.all([
        fetchProperties(),
        serviceIds.length
          ? supabase.from("public_services").select("*").in("id", serviceIds)
          : Promise.resolve({ data: [] }),
      ]);
      const blogArr = rows
        .filter((r) => r.entity_type === "blog_posts")
        .map((r) => ({
          id: r.entity_id,
          title: r.title,
          excerpt: r.snippet,
          slug: r.slug,
          image_url: r.photo,
        }));

      return jsonResponse(
        {
          data: {
            properties: propertiesArr,
            services: servicesArr ?? [],
            blog: blogArr,
          },
          totals: {
            properties: propertiesArr.length,
            services: servicesArr?.length ?? 0,
            blog: blogArr.length,
            all: propertiesArr.length + (servicesArr?.length ?? 0) +
              blogArr.length,
          },
          page: 1,
          per_page: rows.length,
        },
        200,
        corsHeaders,
      );
    }

    let dbQuery = supabase
      .from("public_properties")
      .select("*", { count: "exact" });

    // Location trigram search (also search title)
    if (normalizedQuery) {
      const safeQuery = sanitizeQuery(normalizedQuery);
      dbQuery = dbQuery.or(
        `location.ilike.%${safeQuery}%,title.ilike.%${safeQuery}%`,
      );
    }

    // Rent vs Sale filter
    if (is_for_sale !== undefined && is_for_sale !== null) {
      dbQuery = dbQuery.eq("is_for_sale", is_for_sale);
    }

    // Price filters — use sale_price for sale, price_per_night for rent
    if (is_for_sale) {
      if (price_min) dbQuery = dbQuery.gte("sale_price", price_min);
      if (price_max) dbQuery = dbQuery.lte("sale_price", price_max);
    } else {
      if (price_min) dbQuery = dbQuery.gte("price_per_night", price_min);
      if (price_max) dbQuery = dbQuery.lte("price_per_night", price_max);
    }

    // Other filters
    if (rooms) dbQuery = dbQuery.gte("rooms", rooms);
    if (bathrooms) dbQuery = dbQuery.gte("bathrooms", bathrooms);
    if (capacity) dbQuery = dbQuery.gte("capacity", capacity);
    if (property_type) dbQuery = dbQuery.eq("type", property_type);
    if (Array.isArray(property_types) && property_types.length > 0) {
      dbQuery = dbQuery.in("type", property_types);
    }
    if (cadastral_code) dbQuery = dbQuery.eq("cadastral_code", cadastral_code);
    if (area_min) dbQuery = dbQuery.gte("area_sqm", area_min);
    if (area_max) dbQuery = dbQuery.lte("area_sqm", area_max);
    if (verified_only) dbQuery = dbQuery.eq("profile_is_verified", true);

    // Investment-mode filters. ROI excludes nulls so "min 5%" means
    // "listings whose ROI is known to be ≥ 5%" — not unknown-ROI listings.
    if (typeof roi_min === "number" && roi_min > 0) {
      dbQuery = dbQuery
        .not("roi_percent", "is", null)
        .gte("roi_percent", roi_min);
    }
    if (typeof construction_status === "string" && construction_status) {
      dbQuery = dbQuery.eq("construction_status", construction_status);
    }
    if (typeof renovation_status === "string" && renovation_status) {
      dbQuery = dbQuery.eq("renovation_status", renovation_status);
    }

    // Amenities filter — check JSONB contains each amenity
    if (amenities && Array.isArray(amenities) && amenities.length > 0) {
      for (const amenity of amenities) {
        dbQuery = dbQuery.contains("amenities", [amenity]);
      }
    }

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

    let filtered = properties ?? [];

    // Filter by date availability if dates provided
    if (check_in && check_out) {
      const { data: blockedProps } = await supabase
        .from("calendar_blocks")
        .select("property_id")
        .in(
          "property_id",
          filtered.map((p: { id: string }) => p.id),
        )
        .gte("date", check_in)
        .lt("date", check_out)
        .in("status", ["booked", "blocked"]);

      const blockedIds = new Set(
        blockedProps?.map((b: { property_id: string }) => b.property_id) || [],
      );
      filtered = filtered.filter((p: { id: string }) => !blockedIds.has(p.id));
    }

    // Distance sorting if lat/lng provided
    if (latitude !== null && longitude !== null && filtered) {
      filtered.sort(
        (
          a: { location_lat: number; location_lng: number },
          b: { location_lat: number; location_lng: number },
        ) => {
          const distA = Math.sqrt(
            Math.pow((a.location_lat || 0) - latitude, 2) +
              Math.pow((a.location_lng || 0) - longitude, 2),
          );
          const distB = Math.sqrt(
            Math.pow((b.location_lat || 0) - latitude, 2) +
              Math.pow((b.location_lng || 0) - longitude, 2),
          );
          return distA - distB;
        },
      );
    }

    return jsonResponse(
      {
        data: filtered,
        total: count,
        page,
        per_page,
        total_pages: Math.ceil((count || 0) / per_page),
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
