// DB-stored codes for properties.renovation_status and
// house_rules.management_service (payloads unchanged). Labels live in
// messages under ListingOptions.renovationStatuses / .managementServices.
export const RENOVATION_STATUSES = [
  { value: "black_frame" },
  { value: "white_frame" },
  { value: "green_frame" },
  { value: "renovated" },
  { value: "fully_furnished" },
] as const;

export const MANAGEMENT_SERVICES = [
  { value: "complex_management" },
  { value: "none" },
] as const;
