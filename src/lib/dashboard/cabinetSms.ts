/**
 * Cabinets whose dashboard shows no SMS: no "N SMS" chip in the top bar, no SMS
 * balance in the wallet card, no SMS packages on the balance page and no "web
 * notification & SMS" wording (the owner's call, 2026-10-17). The wallet and
 * `balances.sms_remaining` stay account-wide, so this is display only; the
 * renter and seller cabinets still sell and show SMS credits (C18).
 *
 * Food has its own top bar and balance page that simply never render SMS, so it
 * does not ask. Transport shares `ServiceTopbar`, `service/balance`,
 * `ServiceDashboardClient` and `service/parameters` with entertainment,
 * employment and services, which keep SMS, so those four ask here.
 *
 * Pure module (no imports): `scripts/check-contracts.mjs` (C18/cabinets) pins
 * the list.
 */
const CABINETS_WITHOUT_SMS = ["food", "transport"];

/** `cabinet` is a dashboard scope or service segment/category; null = unknown. */
export function showsSms(cabinet: string | null | undefined): boolean {
  return !CABINETS_WITHOUT_SMS.includes(cabinet ?? "");
}
