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

// How a buyer may pay for a sale listing. Stored as house_rules.payment_options
// (a jsonb string array), written only by create/sale. Labels live under
// ListingOptions.paymentOptions.
export const PAYMENT_OPTIONS = [
  { value: "internal_installment" },
  { value: "full_payment" },
  { value: "bank_installment" },
] as const;

export type PaymentOption = (typeof PAYMENT_OPTIONS)[number]["value"];

/**
 * Defensive read of house_rules.payment_options. Unknown codes are dropped, so
 * a label lookup can never miss, and the result is re-ordered to
 * PAYMENT_OPTIONS so every surface renders the same sequence regardless of the
 * order the seller clicked them in. Takes `unknown` so the `Json | null` column
 * type is assignable at every call site without a cast.
 */
export function readPaymentOptions(houseRules: unknown): PaymentOption[] {
  if (!houseRules || typeof houseRules !== "object") return [];
  const raw = (houseRules as Record<string, unknown>).payment_options;
  if (!Array.isArray(raw)) return [];
  return PAYMENT_OPTIONS.map((o) => o.value).filter((v) => raw.includes(v));
}

/**
 * Sorts to registry order and de-dupes. Both matter on write: the content-change
 * diff compares arrays element-by-element, so an unsorted array would queue a
 * review request for a set the seller never actually changed.
 */
export function normalizePaymentOptions(values: string[]): PaymentOption[] {
  return PAYMENT_OPTIONS.map((o) => o.value).filter((v) => values.includes(v));
}
