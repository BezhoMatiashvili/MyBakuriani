// Guards SSR against legacy/oversized photo data. A few listings stored their
// photos as multi-MB base64 `data:` URLs instead of Storage URLs; embedding one
// in the server-rendered HTML + RSC payload + og:image pushes the response past
// Vercel's serverless function limit and the page 500s. sanitizePhotos drops any
// entry that isn't a lightweight, renderable reference so a bad row degrades to
// the "no photos" placeholder instead of crashing the route.
const MAX_PHOTO_REF_LENGTH = 2048;

// Supabase Storage object URLs have a fixed, portable shape:
// /storage/v1/object/(public|sign)/<bucket>/<path>. That path is the same no
// matter which Supabase project serves it, and this app never stores a
// non-Storage remote URL in a photos field — so any URL matching this shape is
// safe to re-host onto the CURRENT environment's origin, even if it was
// created against a since-migrated/decommissioned project.
const STORAGE_OBJECT_PATH_RE =
  /^\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/;

/**
 * Parses `value` as a Supabase Storage object URL, independent of which
 * project origin it points at. Returns the object's bucket and bucket-relative
 * path (for callers that need to address the object directly, e.g. to delete
 * it), whether it already points at this environment's own Supabase project,
 * and the same URL rebuilt against this environment's own
 * NEXT_PUBLIC_SUPABASE_URL. Returns null for anything else (not a URL, not
 * https, or not shaped like a Storage object).
 */
export function parseStorageObjectUrl(value: string): {
  origin: string;
  bucket: string;
  path: string;
  sameOrigin: boolean;
  currentUrl: string | null;
} | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const match = STORAGE_OBJECT_PATH_RE.exec(url.pathname);
  if (!match) return null;

  const configuredOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let sameOrigin = false;
  let currentUrl: string | null = null;
  if (configuredOrigin) {
    try {
      const currentOrigin = new URL(configuredOrigin).origin;
      sameOrigin = url.origin === currentOrigin;
      currentUrl = `${currentOrigin}${url.pathname}${url.search}`;
    } catch {
      // Malformed env var — leave currentUrl null, same as "can't rehost".
    }
  }

  return {
    origin: url.origin,
    bucket: decodeURIComponent(match[1]),
    path: decodeURIComponent(match[2]),
    sameOrigin,
    currentUrl,
  };
}

export function sanitizePhotos(
  photos: (string | null | undefined)[] | null | undefined,
): string[] {
  if (!photos) return [];
  const out: string[] = [];
  for (const p of photos) {
    if (typeof p !== "string" || p.length > MAX_PHOTO_REF_LENGTH) continue;
    // Local placeholders are repository-controlled — pass through as-is.
    if (p.startsWith("/")) {
      if (!p.startsWith("//")) out.push(p);
      continue;
    }
    // Remote values are only ever Storage object URLs; re-host onto the
    // current project's origin regardless of which origin they were stored
    // against (see parseStorageObjectUrl above), so a Supabase project
    // migration doesn't silently zero out every listing's photos.
    const parsed = parseStorageObjectUrl(p);
    if (parsed?.currentUrl) out.push(parsed.currentUrl);
  }
  return out;
}
