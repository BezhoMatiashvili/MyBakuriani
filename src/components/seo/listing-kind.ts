// The eight public detail routes and the column each one's page content sits
// on (C40). Pure types and constants, shared by the breadcrumb trail and the
// related-listings block so both line up with the page they frame.
export type ListingKind =
  | "apartments"
  | "hotels"
  | "sales"
  | "food"
  | "services"
  | "entertainment"
  | "transport"
  | "employment";

// Must equal the `max-w-*` on the root div of each kind's detail client;
// check-contracts.mjs (C40) compares them. Literal class names so Tailwind
// finds them.
export const DETAIL_WIDTH: Record<ListingKind, string> = {
  apartments: "max-w-7xl",
  hotels: "max-w-7xl",
  sales: "max-w-7xl",
  food: "max-w-7xl",
  services: "max-w-5xl",
  entertainment: "max-w-5xl",
  transport: "max-w-5xl",
  employment: "max-w-6xl",
};
