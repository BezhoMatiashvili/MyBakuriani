/**
 * Service spheres offered by /create/service and the `services.category` each
 * one files the listing under.
 *
 * The category decides everything downstream: `cleaning` puts the owner in the
 * Cleaner cabinet, the renter-facing cleaner directory and cleaner call-outs
 * (C24); `handyman` puts them in the Services cabinet. The form therefore never
 * picks a sphere for the user: it starts empty unless the link they came from
 * already fixes the category (`?category=`).
 *
 * Pure module (no `@/` imports) so scripts/unit can load it (C29).
 */

export const SERVICE_SPHERES = [
  {
    value: "cleaning",
    category: "cleaning",
    dbLabel: "დასუფთავება/დამლაგებელი",
  },
  { value: "handymen", category: "handyman", dbLabel: "ხელოსნები" },
  { value: "staff", category: "handyman", dbLabel: "მომსახურე პერსონალი" },
  { value: "tourism", category: "handyman", dbLabel: "ტურიზმი" },
  { value: "sales", category: "handyman", dbLabel: "გაყიდვები/ვაჭრობა" },
  { value: "other", category: "handyman", dbLabel: "სხვა" },
] as const;

export type SphereValue = (typeof SERVICE_SPHERES)[number]["value"];
export type ServiceFormCategory = (typeof SERVICE_SPHERES)[number]["category"];

/** The `services.category` a sphere files the listing under. */
export function categoryForSphere(sphere: SphereValue): ServiceFormCategory {
  return SERVICE_SPHERES.find((s) => s.value === sphere)!.category;
}

/** Spheres allowed for a category; every sphere while the category is open. */
export function spheresFor(
  category: ServiceFormCategory | null,
): readonly (typeof SERVICE_SPHERES)[number][] {
  return category
    ? SERVICE_SPHERES.filter((s) => s.category === category)
    : SERVICE_SPHERES;
}

/** Reads the `?category=` hint; anything but a form category is no hint. */
export function parseCategoryHint(
  raw: string | null | undefined,
): ServiceFormCategory | null {
  return raw === "cleaning" || raw === "handyman" ? raw : null;
}

/** Link to the create form, optionally fixing the category (cabinet "Add"). */
export function createServiceHref(category?: ServiceFormCategory): string {
  return category ? `/create/service?category=${category}` : "/create/service";
}
