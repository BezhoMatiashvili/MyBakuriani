// Pure module (no imports) so scripts/unit can load it.

// Facebook's outbound-link shim redirects anywhere; no profile URL uses it.
const SHIM_HOSTS = new Set(["l.facebook.com", "lm.facebook.com"]);

/**
 * True only for an https link to facebook.com / fb.com (or a subdomain), the
 * only links the membership dialog lets through (PaymentModal's host check).
 * The servers store any https URL, so admin pages link a stored value only
 * when this holds: a crafted request cannot plant a phishing link under the
 * trusted "Facebook profile" label.
 */
export function isFacebookProfileUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 300) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const facebook =
    host === "facebook.com" ||
    host === "fb.com" ||
    host.endsWith(".facebook.com") ||
    host.endsWith(".fb.com");
  return facebook && !SHIM_HOSTS.has(host) && url.pathname !== "/l.php";
}
