"use server";

import { revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { listingTag } from "@/lib/data/getCachedPublicListing";
import { isUuid } from "@/lib/utils/uuid";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// These actions take an arbitrary UUID with no ownership check (by design —
// any visitor to a public listing page can legitimately trigger a revalidate
// for that page's own tag). Rate-limit by IP so it can't be used to force
// repeated cache-bypassing DB reads against arbitrary listing ids.
async function withinRevalidateLimit(): Promise<boolean> {
  const ip = getClientIp({ headers: await headers() });
  return checkRateLimit(`revalidate-listing:${ip}`, 20, 60_000);
}

/**
 * Bust the cached public view of a property after a renter-side edit
 * (price_overrides / calendar_blocks). Those writes happen client-side under
 * RLS, so without this the public detail page serves stale prices/availability
 * for up to PUBLIC_LISTING_REVALIDATE_S (60s).
 *
 * One property tag covers BOTH caches: getCachedPublicCalendar and
 * getCachedPublicPriceOverrides are both tagged listingTag("property", id), so
 * a single revalidate refreshes calendar + price overrides together.
 */
export async function revalidatePublicProperty(
  propertyId: string,
): Promise<void> {
  if (!isUuid(propertyId)) return;
  if (!(await withinRevalidateLimit())) return;
  revalidateTag(listingTag("property", propertyId));
}

/**
 * Bust the cached public view of an employment listing (service) after a
 * client-side CV submission. job_applications inserts happen directly from
 * the browser under RLS, so without this the public detail page's CV count
 * (getCachedPublicCvCount) can serve a stale count for up to
 * PUBLIC_LISTING_REVALIDATE_S (60s) — longer in practice for a low-traffic
 * listing with nothing else triggering the background revalidation.
 *
 * Also busts getCachedPublicService(id), which shares the same
 * listingTag("service", id) tag — harmless, same idiom as
 * revalidatePublicProperty covering multiple caches under one tag.
 */
export async function revalidatePublicService(
  serviceId: string,
): Promise<void> {
  if (!isUuid(serviceId)) return;
  if (!(await withinRevalidateLimit())) return;
  revalidateTag(listingTag("service", serviceId));
}
