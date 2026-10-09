// SMS financial control (C50, owner spec "SMS Control.docx" §3-§8): the
// vocabularies and the filter parser shared by the admin page, its API and
// its exports. No imports: scripts/unit loads this file directly with Node's
// type stripping.

/**
 * The spec's six SMS types (§6), in the spec's order. Equals
 * sms_usage_ledger_category_check; sms_finance_category() maps every SMS to one.
 */
export const SMS_CATEGORIES = [
  "otp",
  "smart_match",
  "listing",
  "marketing",
  "admin",
  "other",
] as const;
export type SmsCategory = (typeof SMS_CATEGORIES)[number];

/** sms_usage_ledger_status_check (§4: sent / delivered / failed). */
export const SMS_LEDGER_STATUSES = ["sent", "delivered", "failed"] as const;
export type SmsLedgerStatus = (typeof SMS_LEDGER_STATUSES)[number];

/**
 * Every kind the ledger can hold, as the page words it (`kinds.<key>`): the
 * sms_outbound.automation_kind values, `legacy` (rows sent before kinds
 * existed), the two sign-in code kinds, and each notification type the SMS
 * mirror texts (`notification_<type>`, C18 sms_notification_types()).
 */
export const SMS_KIND_KEYS = [
  "check_in",
  "review_request",
  "win_back",
  "price_drop",
  "consent_request",
  "vip_activation",
  "vip_expiry",
  "subscription",
  "notification",
  "legacy",
  "sign_in",
  "phone_change",
  "notification_payment_success",
  "notification_payment_failed",
  "notification_payment_refund",
  "notification_cleaning_task_new",
  "notification_cleaning_task_status",
  "notification_cleaning_task_cancelled",
  "notification_cleaning_task_cancellation_requested",
  "notification_smart_match_offer",
  "notification_listing_moderation",
  "notification_verification",
  "notification_job_application",
] as const;

/** The message key of a ledger kind ("notification:<type>" → "notification_<type>"). */
export function smsKindKey(kind: string): string {
  return kind.replace(":", "_");
}

/** Export blocks of the SMS page (§8); `all` = the whole page. */
export const SMS_EXPORT_BLOCKS = [
  "kpis",
  "balance",
  "types",
  "purchases",
  "ledger",
  "all",
] as const;
export type SmsExportBlock = (typeof SMS_EXPORT_BLOCKS)[number];

export const SMS_LEDGER_PAGE_SIZE = 50;
/** Ledger rows in one export; a PDF holds fewer (pdf-lib keeps every page). */
export const MAX_SMS_EXPORT_ROWS = 20000;
export const MAX_SMS_PDF_ROWS = 1000;
/** = sms_provider_purchases_units_check and the threshold CHECK. */
export const MAX_SMS_UNITS = 10_000_000;

export type SmsFilters = {
  /** Tbilisi days, inclusive; null = no bound. */
  from: string | null;
  to: string | null;
  category: SmsCategory | null;
  status: SmsLedgerStatus | null;
};

export const NO_SMS_FILTERS: SmsFilters = {
  from: null,
  to: null,
  category: null,
  status: null,
};

function oneOf<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (list as readonly string[]).includes(value)
  );
}

function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 2020 || y > 2100) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * The page's URL filters (the finance register keys: from, to, type, status).
 * Unknown or malformed values are refused, never dropped silently.
 */
export function parseSmsFilters(
  params: URLSearchParams,
): { ok: true; filters: SmsFilters } | { ok: false; error: string } {
  const from = params.get("from") || null;
  const to = params.get("to") || null;
  const type = params.get("type") || null;
  const status = params.get("status") || null;
  if (from !== null && !isDay(from))
    return { ok: false, error: "invalid_date" };
  if (to !== null && !isDay(to)) return { ok: false, error: "invalid_to" };
  if (from !== null && to !== null && from > to) {
    return { ok: false, error: "invalid_to" };
  }
  if (type !== null && !oneOf(SMS_CATEGORIES, type)) {
    return { ok: false, error: "invalid_request" };
  }
  if (status !== null && !oneOf(SMS_LEDGER_STATUSES, status)) {
    return { ok: false, error: "invalid_request" };
  }
  return { ok: true, filters: { from, to, category: type, status } };
}

/** The filters back as the page's query string (empty values left out). */
export function smsFiltersToQuery(filters: SmsFilters): string {
  const out = new URLSearchParams();
  if (filters.from) out.set("from", filters.from);
  if (filters.to) out.set("to", filters.to);
  if (filters.category) out.set("type", filters.category);
  if (filters.status) out.set("status", filters.status);
  return out.toString();
}

/** 1 SMS's cost of a package (§3), as sms_provider_purchases.unit_cost: 6 decimals. */
export function smsUnitCost(amount: number, units: number): number | null {
  if (!Number.isFinite(amount) || !Number.isInteger(units) || units < 1)
    return null;
  return Math.round((amount / units) * 1e6) / 1e6;
}
