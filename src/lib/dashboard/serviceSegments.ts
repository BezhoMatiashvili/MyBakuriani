/**
 * The four service cabinets that were split out of the old combined
 * `/dashboard/service` route. Each is a self-contained dashboard that lists
 * only its own service category, mirroring the Food/Cleaner cabinets.
 *
 * Note: the `services` URL segment maps to the `handyman` category/role — the
 * UI label for handyman services is "სერვისები / Services".
 */
export const SERVICE_SEGMENTS = [
  "employment",
  "transport",
  "entertainment",
  "services",
] as const;

export type ServiceSegment = (typeof SERVICE_SEGMENTS)[number];

/** URL segment -> the `DashboardSidebar.roles.*` i18n key used for the subtitle. */
export const SEGMENT_TO_ROLE_KEY: Record<ServiceSegment, string> = {
  employment: "employment",
  transport: "transport",
  entertainment: "entertainment",
  services: "handyman",
};

/** `services.category` value -> the create-listing form for that category. */
export const CATEGORY_TO_CREATE_HREF: Record<string, string> = {
  employment: "/create/employment",
  transport: "/create/transport",
  entertainment: "/create/entertainment",
  handyman: "/create/service",
};

/**
 * Normalize a dashboard URL segment OR a profile role to its canonical service
 * segment. Returns null when the value is not a service cabinet, so callers can
 * use it as the "is this a service dashboard?" check.
 *
 * Accepts the three names that coincide (employment/transport/entertainment),
 * the new `services` segment, the `handyman` profile role, and the legacy
 * combined `service` segment/role.
 */
export function toServiceSegment(
  value: string | null | undefined,
): ServiceSegment | null {
  switch (value) {
    case "employment":
      return "employment";
    case "transport":
      return "transport";
    case "entertainment":
      return "entertainment";
    case "services":
    case "handyman":
    case "service":
      return "services";
    default:
      return null;
  }
}
