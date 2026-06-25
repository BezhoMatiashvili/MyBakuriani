// Message namespaces used by CLIENT components reachable from PUBLIC routes.
//
// The root `[locale]/layout.tsx` provider ships ONLY these namespaces to the
// browser, which cuts ~24KB gzip from every public page's hydration payload
// (the full ka bundle is ~46KB gz). The dashboard layout ships the full bundle
// in a nested provider (auth-gated, lower traffic), so dashboards are unchanged.
//
// This list is the single source of truth and is verified on every build by
// `scripts/i18n-scope.mjs --check` (wired as `prebuild`), which re-derives the
// set via import-graph traversal and fails the build if a newly client-reachable
// namespace is missing here. To regenerate: `node scripts/i18n-scope.mjs`.
export const PUBLIC_NAMESPACES = [
  "ApartmentDetail",
  "ApartmentsPage",
  "AuthLogin",
  "AuthRegister",
  "AvailabilityWizard",
  "BakurianiMap",
  "BlogPage",
  "BookingSidebar",
  "BulkActionBar",
  "Calendar",
  "CreateEmployment",
  "CreateEntertainment",
  "CreateFood",
  "CreateHeader",
  "CreateHub",
  "CreateRental",
  "CreateSale",
  "CreateService",
  "CreateShared",
  "CreateTransport",
  "CriticalNotification",
  "DashboardShared",
  "DateRangeFilter",
  "EmploymentCard",
  "EmploymentDetail",
  "EmploymentPage",
  "EntertainmentDetail",
  "EntertainmentPage",
  "Error",
  "ExactLocationPicker",
  "FAQ",
  "FilterPanel",
  "FoodDetail",
  "FoodPage",
  "Footer",
  "HotOffersCarousel",
  "HotelDetail",
  "HotelsPage",
  "HouseRules",
  "InvestmentCard",
  "Landing",
  "LanguageSelector",
  "ListingOptions",
  "Navbar",
  "PhotoGallery",
  "PhotoUploader",
  "PropertyCard",
  "PropertyDetail",
  "RentBuyToggle",
  "SaleDetail",
  "SalePagination",
  "SalePropertyCard",
  "SaleSearchBox",
  "SalesGrid",
  "SalesPage",
  "SearchBox",
  "SearchPage",
  "ServiceCard",
  "ServiceDetail",
  "ServicesPage",
  "ShareListing",
  "Shared",
  "StatusCards",
  "TransportDetail",
  "TransportPage",
  "UISelect",
  "Wizard",
  "ZoneLocationLink",
  "Zones",
] as const;

/** Returns a shallow copy of `messages` containing only the listed namespaces. */
export function pickMessages<T extends Record<string, unknown>>(
  messages: T,
  names: readonly string[],
): T {
  const out = {} as T;
  for (const name of names) {
    const key = name as keyof T;
    if (messages[key] !== undefined) out[key] = messages[key];
  }
  return out;
}
