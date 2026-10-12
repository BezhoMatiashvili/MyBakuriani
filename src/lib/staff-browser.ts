/**
 * "Admin browser" (C47, the owner's call 2026-10-11): a browser where the
 * admin dashboard was opened neither obeys nor uses up an ad's daily frequency
 * cap and sends no banner statistics, so an admin checking the site never
 * hides an ad from themselves or adds their own views to an advertiser's
 * report. Every other browser, signed in or not, is a visitor.
 *
 * Set by DashboardShell for an admin and by a successful on-site ad preview;
 * cleared on every sign-out path, next to clearSupportChat(). A visitor who
 * sets the key by hand only exempts their own browser.
 *
 * Pure on purpose (no `@/` imports, C29): scripts/unit/ad-preview.test.mjs
 * imports it bare.
 */

export const STAFF_BROWSER_KEY = "mybakuriani:staff_browser";

export function markStaffBrowser(): void {
  try {
    window.localStorage.setItem(STAFF_BROWSER_KEY, "1");
  } catch {
    // Storage unavailable: the browser simply behaves as a visitor's.
  }
}

export function clearStaffBrowser(): void {
  try {
    window.localStorage.removeItem(STAFF_BROWSER_KEY);
  } catch {
    // ignore
  }
}

export function isStaffBrowser(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STAFF_BROWSER_KEY) === "1";
  } catch {
    return false;
  }
}
