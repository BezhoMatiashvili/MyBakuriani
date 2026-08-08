const SUPPORTED_LOCALE_PREFIX = /^\/(ka|en|ru)(?=\/|$)/;

const PUBLIC_ROUTE_ROOTS = new Set([
  "/apartments",
  "/appartments",
  "/blog",
  "/contact",
  "/employment",
  "/entertainment",
  "/faq",
  "/food",
  "/hotels",
  "/privacy",
  "/sales",
  "/search",
  "/services",
  "/terms",
  "/transport",
]);

/** Returns a locale-free, query-free public pathname or null when untrackable. */
export function normalizePublicPageviewPath(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    return null;
  }
  if (
    !value.startsWith("/") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\\") ||
    value.includes("//") ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32)
  ) {
    return null;
  }

  const withoutLocale = value.replace(SUPPORTED_LOCALE_PREFIX, "") || "/";
  const normalized =
    withoutLocale.length > 1 ? withoutLocale.replace(/\/+$/, "") : "/";
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  if (normalized === "/") return normalized;

  const root = `/${segments[1] ?? ""}`;
  return PUBLIC_ROUTE_ROOTS.has(root) ? normalized : null;
}
