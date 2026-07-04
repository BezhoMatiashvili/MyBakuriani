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
