/**
 * Admin on-site ad preview (C47, 2026-10-11): "საიტზე ნახვა" on an ad card
 * opens the public page of the ad's placement with `#mb-ad-preview=<id>`; that
 * page then shows the ad in its slot on every load (no share-of-voice draw, no
 * cap, no phone limit) and counts nothing. A hash, not a query, so the CDN
 * never sees a variant of the page.
 *
 * Pure on purpose (no `@/` imports, C29): scripts/unit/ad-preview.test.mjs
 * imports it bare.
 */

export const AD_PREVIEW_HASH_KEY = "mb-ad-preview";
/** How long a started preview survives reloads and client navigation. */
export const AD_PREVIEW_TTL_MS = 15 * 60_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function adPreviewHash(adId: string): string {
  return `#${AD_PREVIEW_HASH_KEY}=${adId}`;
}

/** The ad id in a location hash, or null (anything but a UUID is ignored). */
export function parseAdPreviewHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const id =
    new URLSearchParams(raw).get(AD_PREVIEW_HASH_KEY)?.trim().toLowerCase() ??
    "";
  return UUID_RE.test(id) ? id : null;
}

/**
 * The public page that shows the placements of a surface, or null when that
 * takes a row to find (a listing's detail page, a blog post).
 */
export function previewPathForSurface(
  surface: string | undefined,
): "/" | "/apartments" | null {
  if (surface === "site" || surface === "home") return "/";
  if (surface === "listing") return "/apartments";
  return null;
}
