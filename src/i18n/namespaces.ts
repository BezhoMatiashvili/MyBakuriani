// Message namespaces used by CLIENT components under each next-intl provider.
//
// The root `[locale]/layout.tsx` provider ships ONLY PUBLIC_NAMESPACES to the
// browser, in every HTML document and every static RSC payload. Route trees
// whose namespaces nobody else needs re-provide them in a nested provider
// instead: /create, /auth, /faq, /review/[token], /sms-consent/[token] and
// /dashboard (see the constants below). A nested NextIntlClientProvider
// REPLACES the messages above it rather than merging, so each constant lists
// every namespace reachable under its provider, shell components included.
//
// These lists are verified on every build by `scripts/i18n-scope.mjs --check`
// (wired as `prebuild`), which re-derives each scope's set via import-graph
// traversal and fails the build if a client-reachable namespace is missing.
// To regenerate: `node scripts/i18n-scope.mjs`.
export const PUBLIC_NAMESPACES = [
  "ApartmentDetail",
  "ApartmentsPage",
  "BakurianiMap",
  "BlogPage",
  "BookingSidebar",
  "Calendar",
  "ConsentGate",
  "ContactReveal",
  "CookieConsent",
  "CriticalNotification",
  "DashboardShared",
  "DateRangeFilter",
  "EmploymentCard",
  "EmploymentDetail",
  "EmploymentPage",
  "EntertainmentDetail",
  "EntertainmentPage",
  "Error",
  "Favorites",
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
  "ListingPreview",
  "Navbar",
  "PhotoGallery",
  "PriceDropSms",
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
  "Support",
  "TransportDetail",
  "TransportPage",
  "ZoneLocationLink",
  "Zones",
] as const;

// Re-provided by src/app/[locale]/create/layout.tsx for the whole /create tree
// (CreateHeader, the forms, loading/error). A nested provider REPLACES the root
// messages, so this lists every namespace reachable under that layout.
export const CREATE_NAMESPACES = [
  "AvailabilityWizard",
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
  "DateRangeFilter",
  "Error",
  "ExactLocationPicker",
  "LanguageSelector",
  "ListingOptions",
  "PhotoUploader",
  "Shared",
  "Support",
  "UISelect",
  "Wizard",
] as const;

// Re-provided by src/app/[locale]/auth/layout.tsx for /auth/*.
export const AUTH_NAMESPACES = [
  "AuthForgotPassword",
  "AuthLogin",
  "AuthRegister",
  "AuthResetPassword",
  "ConsentGate",
  "Error",
  "LanguageSelector",
  "Shared",
] as const;

// Re-provided by src/app/[locale]/faq/page.tsx (the page only: faq/loading.tsx
// and faq/error.tsx render outside it, under the root provider).
export const FAQ_NAMESPACES = ["FAQ"] as const;

// Re-provided by src/app/[locale]/review/[token]/page.tsx.
export const MANUAL_REVIEW_NAMESPACES = ["ManualReview"] as const;

// Re-provided by src/app/[locale]/sms-consent/[token]/page.tsx.
export const SMS_CONSENT_NAMESPACES = ["SmsConsent"] as const;

// Re-provided by src/app/[locale]/dashboard/layout.tsx for /dashboard/**
// (previously the full catalog).
export const DASHBOARD_NAMESPACES = [
  "AdminAdAnalytics",
  "AdminBanners",
  "AdminClientDetail",
  "AdminClients",
  "AdminDashboard",
  "AdminFinances",
  "AdminGuide",
  "AdminInvoices",
  "AdminListings",
  "AdminLogs",
  "AdminMemberships",
  "AdminModeration",
  "AdminPayments",
  "AdminPromocodes",
  "AdminSaleResearch",
  "AdminShared",
  "AdminSignupLinks",
  "AdminStatusCards",
  "AdminStatuses",
  "Calendar",
  "CleanerDashboard",
  "CleanerParameters",
  "CleanerSchedule",
  "ContactReveal",
  "CreateShared",
  "DashboardAccount",
  "DashboardLayout",
  "DashboardShared",
  "DashboardSidebar",
  "DateRangeFilter",
  "Error",
  "ExactLocationPicker",
  "FoodDashboard",
  "FoodOrders",
  "GuestBookings",
  "GuestDashboard",
  "GuestFavorites",
  "GuestProfile",
  "GuestRate",
  "GuestReviews",
  "LanguageSelector",
  "ListingActions",
  "ListingOptions",
  "ListingScopeSelect",
  "MediaUploader",
  "Navbar",
  "NotificationSettings",
  "Organizations",
  "PaymentModal",
  "Payments",
  "PhotoUploader",
  "PriceDropSms",
  "RenterCalendar",
  "RenterCleaners",
  "RenterDashboard",
  "RenterGuests",
  "RenterListings",
  "RenterProfile",
  "RenterReviews",
  "RenterSmartMatch",
  "SMSCenter",
  "SellerAnalytics",
  "SellerDashboard",
  "ServiceDashboard",
  "ServiceParameters",
  "Shared",
  "SmartMatchCard",
  "SmartMatchModal",
  "StatusBadge",
  "Support",
  "UISelect",
  "Wizard",
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
