import { revalidatePath } from "next/cache";

/**
 * Busts the ISR cache of the public *list* pages when a listing's public
 * visibility changes (approve/reject, edit, status toggle).
 *
 * Why: the per-listing cache tag (`listingTag`) only invalidates the *detail*
 * page's `unstable_cache` entries. The category list pages and the landing are
 * plain ISR (`revalidate = 60`) with no tag, so an approved listing otherwise
 * wouldn't appear on its list page for up to 60s. Passing the route pattern +
 * "page" revalidates every locale variant of the route.
 */
const PROPERTY_LIST_ROUTES = [
  "/[locale]/apartments",
  "/[locale]/hotels",
  "/[locale]/sales",
];

const SERVICE_LIST_ROUTES = [
  "/[locale]/food",
  "/[locale]/services",
  "/[locale]/entertainment",
  "/[locale]/transport",
  "/[locale]/employment",
];

export function revalidateListingLists(kind: "property" | "service") {
  const routes =
    kind === "property" ? PROPERTY_LIST_ROUTES : SERVICE_LIST_ROUTES;
  for (const route of routes) revalidatePath(route, "page");
  // Landing shows featured listings from both kinds.
  revalidatePath("/[locale]", "page");
}
