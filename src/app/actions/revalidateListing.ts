"use server";

import { revalidateTag } from "next/cache";
import { listingTag } from "@/lib/data/getCachedPublicListing";
import { isUuid } from "@/lib/utils/uuid";

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
  revalidateTag(listingTag("service", serviceId));
}
