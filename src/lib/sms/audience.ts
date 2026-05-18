// Audience definitions shared by SMS Center UI + API.
//
// Each role sees a subset of audiences. Audience values are also DB enum values
// (see sms_broadcast_audience in 20260518160000_sms_automation_and_broadcasts.sql),
// so renaming requires a migration.

export type SmsAudience =
  | "renter_past_guests"
  | "renter_upcoming_guests"
  | "renter_all_contacts"
  | "food_recent_customers"
  | "food_all_contacts"
  | "service_recent_clients"
  | "service_all_contacts"
  | "seller_active_leads"
  | "seller_new_leads";

export type SenderRole =
  | "renter"
  | "seller"
  | "cleaner"
  | "food"
  | "entertainment"
  | "transport"
  | "employment"
  | "handyman";

export const SENDER_ROLES = new Set<SenderRole>([
  "renter",
  "seller",
  "cleaner",
  "food",
  "entertainment",
  "transport",
  "employment",
  "handyman",
]);

export const AUDIENCES_BY_ROLE: Record<SenderRole, SmsAudience[]> = {
  renter: [
    "renter_upcoming_guests",
    "renter_past_guests",
    "renter_all_contacts",
  ],
  seller: ["seller_active_leads", "seller_new_leads"],
  food: ["food_recent_customers", "food_all_contacts"],
  cleaner: ["service_recent_clients", "service_all_contacts"],
  entertainment: ["service_recent_clients", "service_all_contacts"],
  transport: ["service_recent_clients", "service_all_contacts"],
  employment: ["service_recent_clients", "service_all_contacts"],
  handyman: ["service_recent_clients", "service_all_contacts"],
};

export const ALL_AUDIENCES: SmsAudience[] = [
  "renter_past_guests",
  "renter_upcoming_guests",
  "renter_all_contacts",
  "food_recent_customers",
  "food_all_contacts",
  "service_recent_clients",
  "service_all_contacts",
  "seller_active_leads",
  "seller_new_leads",
];

export function isValidAudienceForRole(
  audience: string,
  role: string,
): audience is SmsAudience {
  if (!SENDER_ROLES.has(role as SenderRole)) return false;
  const allowed = AUDIENCES_BY_ROLE[role as SenderRole] ?? [];
  return allowed.includes(audience as SmsAudience);
}
