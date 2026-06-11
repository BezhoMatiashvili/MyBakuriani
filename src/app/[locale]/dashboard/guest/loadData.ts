import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";
import type { GuestOffer } from "@/components/guest/GuestOffersModal";

export type GuestData = {
  profile: Tables<"profiles"> | null;
  recent: Tables<"properties">[];
  offers: GuestOffer[];
  reviewRequests: Tables<"notifications">[];
};

function requestShortId(id: string) {
  return id.replace(/-/g, "").slice(0, 4).toUpperCase();
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
  const [profileRes, propsRes, offersRes, reviewReqRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase
      .from("properties")
      .select("*")
      .eq("status", "active")
      .order("views_count", { ascending: false })
      .limit(3),
    supabase
      .from("smart_match_offers")
      .select(
        "*, smart_match_requests!inner(id, guest_id), properties(id, title, photos, capacity, price_per_night, is_vip, numeric_rating, owner_id, profiles!owner_id(display_name, avatar_url, rating))",
      )
      .eq("smart_match_requests.guest_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("type", "review_request")
      .eq("is_read", false)
      .order("created_at", { ascending: false }),
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

  return {
    profile: profileRes.data ?? null,
    recent: propsRes.data ?? [],
    offers,
    reviewRequests: reviewReqRes.data ?? [],
  };
}
