import "server-only";
import { createPublicClient } from "@/lib/supabase/server";
import { propertyViewUrl, serviceViewUrl } from "@/lib/utils/listingUrls";

/**
 * The locale-less public page of the listing with this number (C61), or null
 * when no live listing has it. Reads the public views only, so a pending or
 * blocked listing's number never resolves. Any query error (e.g. a database
 * without the column yet) also gives null: an ID search then falls back to an
 * ordinary keyword search instead of failing.
 */
export async function findPublicListingByNumber(
  listingNumber: number,
): Promise<string | null> {
  try {
    const supabase = createPublicClient();
    const [{ data: property }, { data: service }] = await Promise.all([
      supabase
        .from("public_properties")
        .select("id, type, is_for_sale")
        .eq("listing_number", listingNumber)
        .maybeSingle(),
      supabase
        .from("public_services")
        .select("id, category")
        .eq("listing_number", listingNumber)
        .maybeSingle(),
    ]);
    if (property?.id && property.type) {
      return propertyViewUrl({
        id: property.id,
        type: property.type,
        is_for_sale: property.is_for_sale,
      });
    }
    if (service?.id && service.category) {
      return serviceViewUrl({ id: service.id, category: service.category });
    }
    return null;
  } catch {
    return null;
  }
}
