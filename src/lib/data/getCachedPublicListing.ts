import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sanitizePhotos } from "@/lib/utils/photos";
import { isUuid } from "@/lib/utils/uuid";
import type { PropertyWithProfile } from "@/lib/data/getPropertyById";
import type { ServiceWithFoodExtras } from "@/lib/mock/services";

/**
 * Cached, anonymous-only reads for the public view of a listing detail page.
 *
 * Why: the detail routes are `force-dynamic` (they read cookies() for the
 * owner/admin pending-preview path), so without this every visit hits the DB.
 * Under load the burstable DB starves and those reads time out — the
 * "fetching took too long" error. These helpers serve the *public*
 * (status='active') view from the Next data cache, so a cache hit does zero DB
 * round-trips and is immune to DB load.
 *
 * `unstable_cache` is data-layer caching, independent of route render mode: the
 * routes stay force-dynamic and read no cookies on this path (the public client
 * sends no cookie). A `null` result means "not public" — the caller falls back
 * to the cookie-aware dynamic fetch (getPropertyById/getServiceById) for the
 * owner/admin preview.
 *
 * Invalidation: each entry is tagged `property:<id>` / `service:<id>` (see
 * `listingTag`) for instant invalidation from server-side admin mutations, and
 * self-heals after PUBLIC_LISTING_REVALIDATE_S for client-side edits.
 */
export const PUBLIC_LISTING_REVALIDATE_S = 60;

export const listingTag = (kind: "property" | "service", id: string): string =>
  `${kind}:${id}`;

export function getCachedPublicProperty(
  id: string,
): Promise<PropertyWithProfile | null> {
  if (!isUuid(id)) return Promise.resolve(null);
  return unstable_cache(
    async (): Promise<PropertyWithProfile | null> => {
      const supabase = createPublicClient();
      const { data, error } = await supabase
        .from("properties")
        .select("*, profiles!properties_owner_id_fkey(*)")
        .eq("id", id)
        .eq("status", "active")
        .maybeSingle();
      // Don't cache a transient failure as "not found": throw so unstable_cache
      // skips caching and the caller falls through to the dynamic path.
      if (error) throw error;
      const row = (data as PropertyWithProfile) ?? null;
      if (!row) return null;
      row.photos = sanitizePhotos(row.photos);
      return row;
    },
    ["public-property", id],
    {
      tags: [listingTag("property", id)],
      revalidate: PUBLIC_LISTING_REVALIDATE_S,
    },
  )();
}

export function getCachedPublicService(
  id: string,
): Promise<ServiceWithFoodExtras | null> {
  if (!isUuid(id)) return Promise.resolve(null);
  return unstable_cache(
    async (): Promise<ServiceWithFoodExtras | null> => {
      const supabase = createPublicClient();
      const { data, error } = await supabase
        .from("services")
        .select("*, profiles!services_owner_id_fkey(*)")
        .eq("id", id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      const row = (data as ServiceWithFoodExtras) ?? null;
      if (!row) return null;
      row.photos = sanitizePhotos(row.photos);
      return row;
    },
    ["public-service", id],
    {
      tags: [listingTag("service", id)],
      revalidate: PUBLIC_LISTING_REVALIDATE_S,
    },
  )();
}

export function getCachedPublicReviews(id: string) {
  return unstable_cache(
    async () => {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from("reviews")
        .select("*, profiles!reviews_guest_id_fkey(display_name)")
        .eq("property_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    ["public-reviews", id],
    {
      tags: [listingTag("property", id)],
      revalidate: PUBLIC_LISTING_REVALIDATE_S,
    },
  )();
}

export function getCachedPublicCalendar(id: string) {
  return unstable_cache(
    async () => {
      const supabase = createPublicClient();
      const today = new Date();
      const horizon = new Date(today);
      horizon.setMonth(horizon.getMonth() + 3);
      const { data } = await supabase
        .from("calendar_blocks")
        .select("date, status")
        .eq("property_id", id)
        .gte("date", today.toISOString().split("T")[0])
        .lte("date", horizon.toISOString().split("T")[0]);
      return data ?? [];
    },
    ["public-calendar", id],
    {
      tags: [listingTag("property", id)],
      revalidate: PUBLIC_LISTING_REVALIDATE_S,
    },
  )();
}

export function getCachedPublicPriceOverrides(
  id: string,
): Promise<PublicPriceOverrides> {
  return unstable_cache(
    async (): Promise<PublicPriceOverrides> => {
      const supabase = createPublicClient();
      const today = new Date();
      const horizon = new Date(today);
      horizon.setMonth(horizon.getMonth() + 3);
      const { data } = await supabase
        .from("price_overrides")
        .select("date, price")
        .eq("property_id", id)
        .gte("date", today.toISOString().split("T")[0])
        .lte("date", horizon.toISOString().split("T")[0]);
      return (data ?? []).map((o) => ({
        date: o.date,
        price: Number(o.price),
      }));
    },
    ["public-price-overrides", id],
    {
      tags: [listingTag("property", id)],
      revalidate: PUBLIC_LISTING_REVALIDATE_S,
    },
  )();
}

// Service-role (RLS-bypassing) read: job_applications only grants SELECT to the
// listing owner and admins, so the anon/public client always sees zero rows here.
// Only aggregate counts (never applicant PII) leave this function.
async function fetchCvCounts(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("job_applications")
    .select("service_id")
    .in("service_id", ids)
    .not("cv_path", "is", null);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.service_id] = (counts[row.service_id] ?? 0) + 1;
  }
  return counts;
}

// Batch variant for the employment list page — one query for all visible ids.
export const getCvCountsForServices = fetchCvCounts;

export function getCachedPublicCvCount(id: string): Promise<number> {
  return unstable_cache(
    async (): Promise<number> => (await fetchCvCounts([id]))[id] ?? 0,
    ["public-cv-count", id],
    {
      tags: [listingTag("service", id)],
      revalidate: PUBLIC_LISTING_REVALIDATE_S,
    },
  )();
}

// Shared result shapes so the dynamic fallback path on each detail page can type
// its withTimeout fallback identically to the cached path (same select strings).
export type PublicReviews = Awaited<ReturnType<typeof getCachedPublicReviews>>;
export type PublicCalendar = Awaited<
  ReturnType<typeof getCachedPublicCalendar>
>;
export type PublicPriceOverrides = { date: string; price: number }[];
