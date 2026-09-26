import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";
import type { GuestOffer } from "@/components/guest/GuestOffersModal";

/** Max listings loaded for the "recently viewed" section: the viewer's own
 *  history, newest first. The dashboard shows a few collapsed; the rest are
 *  revealed in-place by the expand toggle. */
const RECENT_LIMIT = 12;

/** One "recently viewed" card: a property or a service (C9), read from its
 *  public view. */
export type RecentListing =
  | { kind: "property"; listing: Tables<"public_properties"> }
  | { kind: "service"; listing: Tables<"public_services"> };

/** A Smart Match request the guest sent, shown back to them on the dashboard. */
export type MyRequest = {
  id: string;
  checkIn: string | null;
  checkOut: string | null;
  guestsCount: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  zone: string | null; // null = all zones; otherwise Zone.name_ka
  status: string | null; // 'active' | 'cancelled' | (other)
  createdAt: string | null;
  offerCount: number; // derived from `offers`, not separately queried
};

export type GuestData = {
  profile: Tables<"profiles"> | null;
  recent: RecentListing[];
  offers: GuestOffer[];
  reviewRequests: Tables<"notifications">[];
  requests: MyRequest[];
};

function requestShortId(id: string) {
  return id.replace(/-/g, "").slice(0, 4).toUpperCase();
}

/**
 * The viewer's own recently viewed listings, newest first (C34). History rows
 * are written by the view beacon route; listings that are no longer public are
 * dropped here.
 */
async function loadRecentListings(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RecentListing[]> {
  // Over-fetch: history rows whose listing is no longer public are dropped below.
  const { data: history } = await supabase
    .from("recently_viewed_listings")
    .select("property_id, service_id")
    .eq("user_id", userId)
    .order("viewed_at", { ascending: false })
    .limit(RECENT_LIMIT * 2);
  if (!history?.length) return [];

  const propertyIds = history.flatMap((h) =>
    h.property_id ? [h.property_id] : [],
  );
  const serviceIds = history.flatMap((h) =>
    h.service_id ? [h.service_id] : [],
  );

  // Public views only: base tables are RLS-hidden from non-owners, and views
  // carry no relationships to embed (favorites pattern).
  const [propsRes, servicesRes] = await Promise.all([
    propertyIds.length
      ? supabase.from("public_properties").select("*").in("id", propertyIds)
      : Promise.resolve({ data: [] as Tables<"public_properties">[] }),
    serviceIds.length
      ? supabase.from("public_services").select("*").in("id", serviceIds)
      : Promise.resolve({ data: [] as Tables<"public_services">[] }),
  ]);

  const properties = new Map((propsRes.data ?? []).map((p) => [p.id, p]));
  const services = new Map((servicesRes.data ?? []).map((s) => [s.id, s]));

  // Merge in history order (newest first).
  const recent: RecentListing[] = [];
  for (const h of history) {
    const property = h.property_id ? properties.get(h.property_id) : undefined;
    if (property) {
      recent.push({ kind: "property", listing: property });
      continue;
    }
    const service = h.service_id ? services.get(h.service_id) : undefined;
    if (service) recent.push({ kind: "service", listing: service });
  }
  return recent.slice(0, RECENT_LIMIT);
}

/**
 * Loads the guest dashboard data. Shared by the server component (initial render,
 * server client) and the client realtime handler (browser client) so the queries
 * and mapping live in one place and the first paint already has real data.
 */
export async function loadGuestData(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GuestData> {
  const [profileRes, recent, offersRes, reviewReqRes, requestsRes] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      loadRecentListings(supabase, userId),
      supabase
        .from("smart_match_offers")
        .select(
          "*, smart_match_requests!inner(id, guest_id), properties(id, title, photos, capacity, price_per_night, is_vip, numeric_rating, owner_id, profiles!owner_id(display_name, avatar_url, rating))",
        )
        .eq("smart_match_requests.guest_id", userId)
        // A renter can withdraw a sent offer (status -> 'cancelled'); it must not
        // remain visible/acceptable to the guest.
        .neq("status", "cancelled")
        .order("created_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .eq("type", "review_request")
        .eq("dashboard_scope", "guest")
        .eq("is_read", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("smart_match_requests")
        .select(
          "id, check_in, check_out, guests_count, budget_min, budget_max, zone, status, created_at",
        )
        .eq("guest_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const offers: GuestOffer[] = (offersRes.data ?? [])
    .map((row) => {
      const property = (
        row as unknown as {
          properties: {
            id: string;
            title: string;
            photos: string[] | null;
            capacity: number | null;
            price_per_night: number | null;
            is_vip: boolean | null;
            numeric_rating: number | null;
            profiles: {
              display_name: string | null;
              avatar_url: string | null;
              rating: number | null;
            } | null;
          } | null;
        }
      ).properties;
      const request = (
        row as unknown as {
          smart_match_requests: { id: string };
        }
      ).smart_match_requests;
      if (!property) return null;
      return {
        id: row.id,
        requestId: request.id,
        requestShortId: requestShortId(request.id),
        createdAt: row.created_at,
        offeredPrice: Number(row.offered_price),
        status: row.status as GuestOffer["status"],
        renter: {
          // null = no display name; the render site translates the fallback.
          displayName: property.profiles?.display_name ?? null,
          avatarUrl: property.profiles?.avatar_url ?? null,
          rating: property.profiles?.rating ?? null,
          listingsCount: null,
        },
        property: {
          id: property.id,
          title: property.title,
          photo: (property.photos ?? [])[0] ?? null,
          rating: property.numeric_rating ?? null,
          capacity: property.capacity,
          pricePerNight: Number(property.price_per_night ?? 0),
          isVip: Boolean(property.is_vip),
        },
      } as GuestOffer;
    })
    .filter((o): o is GuestOffer => o !== null);

  // Offer count per request, derived from the offers already loaded above (each
  // GuestOffer carries its requestId), so no extra query is needed.
  const offerCountByRequest = new Map<string, number>();
  for (const o of offers) {
    offerCountByRequest.set(
      o.requestId,
      (offerCountByRequest.get(o.requestId) ?? 0) + 1,
    );
  }

  const requests: MyRequest[] = (requestsRes.data ?? []).map((r) => ({
    id: r.id,
    checkIn: r.check_in,
    checkOut: r.check_out,
    guestsCount: r.guests_count,
    budgetMin: r.budget_min,
    budgetMax: r.budget_max,
    zone: r.zone,
    status: r.status,
    createdAt: r.created_at,
    offerCount: offerCountByRequest.get(r.id) ?? 0,
  }));

  return {
    profile: profileRes.data ?? null,
    recent,
    offers,
    reviewRequests: reviewReqRes.data ?? [],
    requests,
  };
}
